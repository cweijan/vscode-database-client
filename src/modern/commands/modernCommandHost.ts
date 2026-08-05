import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions, QueryResult } from "../database/types";

export interface ModernCommandHost {
  refresh(target?: unknown): Promise<void> | void;
  refreshAll(): Promise<void> | void;
  openConnection(mode?: "create" | "edit" | "copy", target?: unknown): Promise<unknown>;
  openConsole(): Promise<unknown>;
  runSql(sql?: string, options?: { newView?: boolean; json?: boolean; parse?: boolean }): Promise<unknown>;
  openQuery(target?: unknown): Promise<unknown>;
  createNode(target?: unknown): Promise<unknown>;
  openHistory(target?: unknown): Promise<unknown>;
  clearHistory(): Promise<void> | void;
}

function asConnection(value: unknown): ConnectionOptions | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const item = value as Partial<ConnectionOptions>;
  return item.id && item.type ? (item as ConnectionOptions) : undefined;
}

function connectionRecords(value: unknown): Record<string, ConnectionOptions> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map(asConnection)
        .filter((item): item is ConnectionOptions => item !== undefined)
        .map((item) => [item.id, item]),
    );
  }
  return value && typeof value === "object"
    ? { ...(value as Record<string, ConnectionOptions>) }
    : {};
}

function resultState<Row>(sql: string, result: QueryResult<Row>): Record<string, unknown> {
  return {
    sql,
    rows: result.rows,
    fields: result.fields,
    affectedRows: result.affectedRows,
    error: undefined,
  };
}

export function createModernCommandHost(
  services: ExtensionServices,
): ModernCommandHost {
  const openText = async (content: string, language = "sql"): Promise<unknown> => {
    const document = await vscode.workspace.openTextDocument({ content, language });
    return vscode.window.showTextDocument(document);
  };

  const openRoute = async (
    title: string,
    type: string,
    route: string,
    state: unknown = {},
    eventHandler?: (handler: import("../core/webviewHandler").TypedWebviewHandler) => void,
  ): Promise<vscode.WebviewPanel> => {
    return services.webviews.createWebviewPanel({
      title,
      type,
      id: type,
      route,
      state,
      eventHandler,
    });
  };

  const saveConnection = async (value: unknown): Promise<void> => {
    const connection = asConnection(value);
    if (!connection) {
      throw new Error("Connection id and type are required");
    }
    const current = connectionRecords(services.state.get("mysql.connections", {}));
    current[connection.id] = connection;
    await services.state.update("mysql.connections", current);
  };

  return {
    refresh(target) {
      const candidate = target as { reloadExpandedChild?: () => void } | undefined;
      candidate?.reloadExpandedChild?.();
    },

    refreshAll() {
      void vscode.window.showInformationMessage("Database tree refreshed.");
    },

    async openConnection(mode = "create", target) {
      const current = asConnection(target);
      return openRoute(
        mode === "create" ? "New Connection" : "Edit Connection",
        "connect",
        "connect",
        { mode, connection: current },
        (handler) => {
          handler.on("saveConnection", (value) => saveConnection(value));
          handler.on("save", (value) => saveConnection(value));
        },
      );
    },

    openConsole() {
      return openRoute(
        "Database Console",
        "console",
        "center/console",
        {},
        (handler) => {
          handler.on("runSQL", async (content) => {
            const sql = typeof content === "string" ? content : "";
            const connection = services.activeConnection.get();
            if (!connection) {
              await handler.send("error", "No active database connection");
              return;
            }
            try {
              const result = await services.connections.query(connection, sql);
              const state = resultState(sql, result);
              await handler.setWebviewState(state);
              await handler.send("result", state);
            } catch (error) {
              await handler.send(
                "error",
                error instanceof Error ? error.message : String(error),
              );
            }
          });
        },
      );
    },

    async runSql(sql, options = {}) {
      const source = typeof sql === "string" && sql.trim()
        ? sql
        : vscode.window.activeTextEditor?.document.getText() || "";
      const connection = services.activeConnection.get();
      if (!source.trim()) {
        throw new Error("SQL text is empty");
      }
      if (!connection) {
        throw new Error("No active database connection");
      }
      const result = await services.connections.query(connection, source);
      if (options.json) {
        return openText(JSON.stringify(result.rows, null, 2), "json");
      }
      return openRoute(
        "SQL Result",
        "result",
        "result",
        resultState(source, result),
      );
    },

    async openQuery(target) {
      const connection = asConnection(target) || services.activeConnection.get();
      const name = connection?.id || "query";
      return openText(`-- ${name}\nSELECT 1;`);
    },

    async createNode(target) {
      return openRoute("New Database Object", "connect", "connect", {
        parent: asConnection(target),
      });
    },

    async openHistory() {
      return openRoute("SQL History", "history", "center/console", {
        history: services.state.get("sql.history", []),
      });
    },

    clearHistory() {
      return services.state.update("sql.history", []);
    },
  };
}
