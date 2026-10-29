import * as vscode from "vscode";

import {
  registerWebviewUtilityProtocols,
  openErDiagramPanel,
} from "../commands/webviewUtilityProtocols";
import {
  bindResultProtocols,
  type ResultState,
} from "../commands/resultProtocols";
import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions, QueryField, QueryResult } from "../database/types";
import {
  asConnection,
  record,
  sanitizeWebviewState,
} from "./webviewState";

function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function storedConnections(services: ExtensionServices): ConnectionOptions[] {
  const values = [
    services.state.get<unknown>("database.connections", {}),
    services.state.get<unknown>("nosql.connections", {}),
  ];
  return values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value.map(asConnection).filter(
        (item): item is ConnectionOptions => item !== undefined,
      );
    }
    if (!value || typeof value !== "object") return [];
    return Object.entries(value as Record<string, unknown>)
      .map(([id, item]) => asConnection({ ...record(item), id }))
      .filter((item): item is ConnectionOptions => item !== undefined);
  });
}

function connectionForKey(
  services: ExtensionServices,
  key: unknown,
): ConnectionOptions | undefined {
  const id = text(key);
  if (!id) return undefined;
  return storedConnections(services).find((connection) => connection.id === id);
}

function fields(value: unknown): QueryField[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): QueryField | undefined => {
      const field = record(item);
      const name = String(field.name || field.columnName || "");
      return name ? { ...field, name } : undefined;
    })
    .filter((item): item is QueryField => item !== undefined);
}

function resultFromState(value: Record<string, unknown>): QueryResult<Record<string, unknown>> {
  return {
    rows: rows(value.rows) as Record<string, unknown>[],
    fields: fields(value.fields),
    affectedRows: typeof value.affectedRows === "number" ? value.affectedRows : undefined,
  };
}

function routeState(value: unknown): Record<string, unknown> {
  return sanitizeWebviewState(value);
}

async function restoreUtilityPanel(
  services: ExtensionServices,
  panel: vscode.WebviewPanel,
  route: string,
  value: unknown,
): Promise<void> {
  const state = routeState(value);
  await services.webviews.createWebviewPanel({
    webviewPanel: panel,
    title: panel.title,
    type: route,
    route,
    state,
    eventHandler: (handler) => {
      registerWebviewUtilityProtocols({
        route,
        target: state.target,
        state,
        webviewState: state,
        services,
        handler,
      });
    },
  });
}

async function restoreResultPanel(
  services: ExtensionServices,
  panel: vscode.WebviewPanel,
  value: unknown,
): Promise<void> {
  const source = record(value);
  const sql = typeof source.sql === "string" ? source.sql : "";
  const connection = asConnection(source.connection) || services.activeConnection.get();
  if (!sql || !connection) {
    panel.dispose();
    return;
  }

  let result = resultFromState(source);
  try {
    result = await services.connections.query<Record<string, unknown>>(connection, sql);
  } catch (error) {
    services.logger.debug("Result panel restore query failed; using saved rows", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const title = typeof source.title === "string" && source.title
    ? source.title
    : "SQL Result";
  const state: ResultState = {
    title,
    sql,
    baseSql: typeof source.baseSql === "string" ? source.baseSql : sql,
    sourceSql: typeof source.sourceSql === "string" ? source.sourceSql : sql,
    rows: result.rows,
    fields: result.fields,
    columnList: fields(source.columnList),
    primaryKey: typeof source.primaryKey === "string" ? source.primaryKey : undefined,
    primaryKeyList: fields(source.primaryKeyList),
    tableCount: typeof source.tableCount === "number" ? source.tableCount : undefined,
    affectedRows: result.affectedRows,
    dirty: false,
    table: typeof source.table === "string" ? source.table : undefined,
    schema: typeof source.schema === "string" ? source.schema : null,
    database: typeof source.database === "string" ? source.database : null,
    readonly: source.readonly === true,
    readOnly: source.readOnly === true,
    pageNum: Math.max(1, Number(source.pageNum) || 1),
    pageSize: Math.max(1, Number(source.pageSize) || services.config.get("defaultSelectLimit")),
    total: typeof source.total === "number" ? source.total : undefined,
    serverPaging: source.serverPaging !== false,
    filters: Array.isArray(source.filters) ? source.filters as ResultState["filters"] : undefined,
    sort: record(source.sort).column
      ? {
        column: String(record(source.sort).column),
        descending: record(source.sort).descending === true,
      }
      : undefined,
  };

  await services.webviews.createWebviewPanel({
    webviewPanel: panel,
    title,
    type: "result",
    route: "result",
    state,
    eventHandler: (handler) => {
      bindResultProtocols({
        services,
        handler,
        state,
        connection,
        openText: async (content, language = "sql") => {
          const document = await vscode.workspace.openTextDocument({ content, language });
          return vscode.window.showTextDocument(document);
        },
        openHistory: async () => {
          await vscode.commands.executeCommand("mysql.history.open");
        },
        openConsole: async () => {
          await vscode.commands.executeCommand("mysql.console.open");
        },
        openErDiagram: () => openErDiagramPanel(services, {
          connection,
          table: state.table,
          schema: state.schema,
          database: state.database,
        }),
      });
    },
  });
}

async function restoreDockerLogs(
  services: ExtensionServices,
  panel: vscode.WebviewPanel,
  value: unknown,
): Promise<void> {
  const source = record(value);
  const container = record(source.containerInfo);
  const connection = asConnection(source.connection)
    || connectionForKey(services, source.nodeKey);
  const containerId = text(container.Id || container.ID || container.id || container.Name || container.name);
  if (!connection || connection.type !== "Docker" || !containerId) {
    panel.dispose();
    return;
  }
  const sql = `GET /containers/${encodeURIComponent(containerId)}/logs?stdout=1&stderr=1&timestamps=1`;
  await restoreResultPanel(services, panel, {
    title: text(container.Name || container.name) || "Docker Container Logs",
    sql,
    connection,
  });
}

async function restoreLokiLogs(
  services: ExtensionServices,
  panel: vscode.WebviewPanel,
  value: unknown,
): Promise<void> {
  const source = record(value);
  const connection = asConnection(source.connection)
    || connectionForKey(services, source.connectionKey);
  const label = text(source.parentLabel).trim();
  const labelValue = text(source.labelName).trim();
  if (!connection || connection.type !== "Loki" || !label || !labelValue) {
    panel.dispose();
    return;
  }
  const state = {
    connection,
    parentLabel: label,
    labelName: labelValue,
  };
  await services.webviews.createWebviewPanel({
    webviewPanel: panel,
    title: `${label}=${labelValue}`,
    type: "lokiLog",
    route: "lokiLog",
    state,
    eventHandler: (handler) => {
      registerWebviewUtilityProtocols({
        route: "lokiLog",
        target: state,
        state,
        webviewState: state,
        services,
        handler,
      });
    },
  });
}

async function restoreCloudService(
  services: ExtensionServices,
  panel: vscode.WebviewPanel,
  value: unknown,
): Promise<void> {
  const source = record(value);
  const page = source.page === "console" ? "console" : "plan";
  const state: Record<string, unknown> = { ...source, page };
  await services.webviews.createWebviewPanel({
    webviewPanel: panel,
    title: "Database Client",
    type: "cloudService",
    route: page,
    state,
    eventHandler: (handler) => {
      registerWebviewUtilityProtocols({
        route: page,
        target: state.param,
        state,
        webviewState: state,
        services,
        handler,
      });
    },
  });
}

function serializer(
  services: ExtensionServices,
  route: string,
): vscode.WebviewPanelSerializer {
  return {
    deserializeWebviewPanel: async (panel, state) => {
      try {
        await restoreUtilityPanel(services, panel, route, state);
      } catch (error) {
        services.logger.error(`Unable to restore ${route} panel`, error);
        panel.dispose();
      }
    },
  };
}

export function registerModernWebviewSerializers(
  services: ExtensionServices,
): vscode.Disposable[] {
  const result = vscode.window.registerWebviewPanelSerializer(
    "result",
    {
      deserializeWebviewPanel: async (panel, state) => {
        try {
          await restoreResultPanel(services, panel, state);
        } catch (error) {
          services.logger.error("Unable to restore result panel", error);
          panel.dispose();
        }
      },
    },
  );
  return [
    result,
    vscode.window.registerWebviewPanelSerializer(
      "redisKey",
      serializer(services, "keyView"),
    ),
    vscode.window.registerWebviewPanelSerializer(
      "sshTerminal",
      serializer(services, "sshTerminal"),
    ),
    vscode.window.registerWebviewPanelSerializer(
      "forward",
      serializer(services, "forward"),
    ),
    vscode.window.registerWebviewPanelSerializer("dockerLogs", {
      deserializeWebviewPanel: async (panel, state) => {
        try {
          await restoreDockerLogs(services, panel, state);
        } catch (error) {
          services.logger.error("Unable to restore Docker logs panel", error);
          panel.dispose();
        }
      },
    }),
    vscode.window.registerWebviewPanelSerializer("lokiLog", {
      deserializeWebviewPanel: async (panel, state) => {
        try {
          await restoreLokiLogs(services, panel, state);
        } catch (error) {
          services.logger.error("Unable to restore Loki log panel", error);
          panel.dispose();
        }
      },
    }),
    vscode.window.registerWebviewPanelSerializer("cloudService", {
      deserializeWebviewPanel: async (panel, state) => {
        try {
          await restoreCloudService(services, panel, state);
        } catch (error) {
          services.logger.error("Unable to restore cloud service panel", error);
          panel.dispose();
        }
      },
    }),
  ];
}
