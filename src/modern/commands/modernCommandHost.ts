import * as vscode from "vscode";
import { readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { formatElasticBody } from "../providers/elasticsearchDocumentModel";
import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions, Dialect, QueryResult } from "../database/types";
import { asConnectionOptions } from "../database/connectionOptions";
import type { MongoDumpOperation } from "../database/mongoDumpService";
import { collectFullTextSearchTargets, type FullTextSearchTarget } from "../database/fullTextSearch";
import {
  queryScopeKey,
  type QueryFileExtension,
} from "../database/queryFiles";
import { parseSqlBlocks } from "../providers/sqlDocumentModel";
import {
  openErDiagramPanel,
  registerWebviewUtilityProtocols,
} from "./webviewUtilityProtocols";
import { bindResultProtocols, type ResultState } from "./resultProtocols";
import {
  normalizeSqlHistoryEntry,
  recordSqlHistory,
  sqlHistoryDocument,
} from "../tree/sqlHistory";

export interface ModernCommandHost {
  refresh(target?: unknown): Promise<void> | void;
  refreshAll(): Promise<void> | void;
  openConnection(mode?: "create" | "edit" | "copy", target?: unknown): Promise<unknown>;
  openConsole(): Promise<unknown>;
  runSql(sql?: string, options?: { newView?: boolean; json?: boolean; parse?: boolean }): Promise<unknown>;
  runCodeLens?(target?: unknown): Promise<unknown>;
  selectCodeLens?(uri?: unknown, range?: unknown): Promise<unknown>;
  runAi?(uri?: unknown, range?: unknown, provider?: "copilot" | "cursor"): Promise<unknown>;
  resetMock?(target?: unknown): Promise<unknown>;
  runElasticQuery?(request?: unknown, parse?: boolean): Promise<unknown>;
  openElasticDocument?(request?: unknown): Promise<unknown>;
  copyElasticAsCurl?(request?: unknown): Promise<unknown>;
  lintElastic?(request?: unknown): Promise<unknown>;
  resetDdlTemplate?(
    connection?: unknown,
    createType?: unknown,
    uri?: unknown,
    range?: unknown,
  ): Promise<unknown>;
  sendMessage?(document?: unknown): Promise<unknown>;
  stopMessageProducer?(document?: unknown): Promise<unknown>;
  startMessageConsumer?(document?: unknown): Promise<unknown>;
  stopMessageConsumer?(document?: unknown): Promise<unknown>;
  configureMessageOffset?(document?: unknown): Promise<unknown>;
  pullDockerCompose?(target?: unknown): Promise<unknown>;
  openQuery(target?: unknown): Promise<unknown>;
  openNotebook?(mode?: "new" | "open"): Promise<unknown>;
  addQuery?(target?: unknown, notebook?: boolean): Promise<unknown>;
  renameQuery?(target?: unknown): Promise<unknown>;
  deleteQuery?(target?: unknown): Promise<unknown>;
  linkQueryFolder?(target?: unknown): Promise<unknown>;
  mongoDump?(target?: unknown): Promise<unknown>;
  mongoRestore?(target?: unknown): Promise<unknown>;
  createNode(target?: unknown): Promise<unknown>;
  openHistory(target?: unknown): Promise<unknown>;
  viewHistory?(target?: unknown): Promise<unknown>;
  clearHistory(): Promise<void> | void;
  serverInfo?(target?: unknown): Promise<unknown>;
  filterChildren?(target?: unknown): Promise<unknown> | unknown;
  activateDatabase?(target?: unknown): Promise<unknown> | unknown;
  generateDocument?(target?: unknown): Promise<unknown>;
  importSql?(target?: unknown): Promise<unknown>;
  createMock?(target?: unknown): Promise<unknown>;
  runMock?(target?: unknown): Promise<unknown>;
  changeTableName?(target?: unknown): Promise<unknown>;
  fullTextSearch?(target?: unknown): Promise<unknown>;
  openUtility?(route: string, title: string, target?: unknown): Promise<unknown>;
  runDockerCompose?(target?: unknown): Promise<unknown>;
  collapseTrees?(noSql?: boolean): Promise<unknown> | unknown;
}

function asConnection(value: unknown): ConnectionOptions | undefined {
  return asConnectionOptions(value);
}

function targetConnection(value: unknown): ConnectionOptions | undefined {
  const direct = asConnection(value);
  if (direct) {
    return direct;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as { connection?: unknown; options?: unknown };
  return asConnection(candidate.connection) || asConnection(candidate.options);
}

function ddlTemplate(dialect: Dialect, createType: string): string | undefined {
  switch (createType.toLowerCase()) {
    case "table": return dialect.tableTemplate?.();
    case "view": return dialect.viewTemplate?.();
    case "procedure": return dialect.procedureTemplate?.();
    case "function": return dialect.functionTemplate?.();
    case "trigger": return dialect.triggerTemplate?.();
    case "event": return dialect.eventTemplate?.();
    case "package": return dialect.packageTemplate?.();
    default: return undefined;
  }
}

function targetRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function targetGroup(value: unknown): string | undefined {
  const group = targetRecord(value).group;
  return typeof group === "string" && group.trim() ? group.trim() : undefined;
}

function withTargetGroup(value: unknown, group: string | undefined): unknown {
  if (!group || !value || typeof value !== "object" || Array.isArray(value)) return value;
  return { ...targetRecord(value), group };
}

function documentText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { getText?: unknown };
  return typeof candidate.getText === "function"
    ? String(candidate.getText.call(value))
    : undefined;
}

function elasticRequestSource(value: unknown): string {
  const request = targetRecord(value);
  const method = typeof request.method === "string" ? request.method : "GET";
  const requestPath = typeof request.path === "string" ? request.path : "/";
  const bodyText = typeof request.bodyText === "string"
    ? request.bodyText.trim()
    : request.body === undefined
      ? ""
      : JSON.stringify(request.body, null, 2);
  return bodyText ? `${method} ${requestPath}\n${bodyText}` : `${method} ${requestPath}`;
}

function elasticDocumentSlug(value: unknown): string | undefined {
  const requestPath = targetRecord(value).path;
  if (typeof requestPath !== "string") return undefined;
  const documentMap: Readonly<Record<string, string>> = {
    _count: "search-count",
    _search: "search-search",
    _explain: "search-explain",
    _stats: "indices-stats",
    _analyze: "indices-analyze",
    _async_search: "async_search",
    _sql: "sql-search-api",
    _health: "health-api",
    _settings: "_index_settings",
  };
  return requestPath
    .split("/")
    .map((part) => documentMap[part])
    .find((part): part is string => part !== undefined);
}

function stringOption(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function quotedCommandArgument(value: string): string {
  return JSON.stringify(value);
}

function editorForUri(uriValue: unknown): vscode.TextEditor | undefined {
  const uri = uriValue instanceof vscode.Uri ? uriValue : undefined;
  return uri
    ? vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === uri.toString(),
    )
    : vscode.window.activeTextEditor;
}

function elasticCurlSource(
  request: Record<string, unknown>,
  connection: ConnectionOptions,
): string {
  const options = connection.options || {};
  const httpAuth = options.httpAuth && typeof options.httpAuth === "object"
    ? options.httpAuth as Record<string, unknown>
    : {};
  const endpoint = stringOption(options, "url")
    || connection.connectionUrl
    || (connection.host?.startsWith("http")
      ? connection.host
      : `http://${connection.host || "127.0.0.1"}:${connection.port || 9200}`);
  const requestPath = typeof request.path === "string" ? request.path : "/";
  const method = typeof request.method === "string" ? request.method.toUpperCase() : "GET";
  const body = typeof request.bodyText === "string"
    ? request.bodyText.trim()
    : request.body === undefined
      ? ""
      : JSON.stringify(request.body);
  const contentType = requestPath.includes("_bulk")
    ? "application/x-ndjson"
    : "application/json";
  const parts = [
    "curl",
    `-X${method}`,
    quotedCommandArgument(`${endpoint.replace(/\/$/, "")}${requestPath.startsWith("/") ? requestPath : `/${requestPath}`}`),
    "-H",
    quotedCommandArgument(`Content-Type: ${contentType}`),
  ];
  if (httpAuth.authType === "account" && connection.user) {
    parts.push("-u", quotedCommandArgument(`${connection.user}:${connection.password || ""}`));
  } else if (httpAuth.authType === "token") {
    const token = stringOption(httpAuth, "basicToken");
    if (token) parts.push("-H", quotedCommandArgument(`Authorization: ${token}`));
  }
  if (body) parts.push("-d", quotedCommandArgument(body.replace(/\r?\n/g, " ")));
  return parts.join(" ");
}

function targetQueryFile(value: unknown): string | undefined {
  const candidate = targetRecord(value);
  for (const key of ["filePath", "queryPath", "path"]) {
    const filePath = candidate[key];
    if (typeof filePath === "string" && filePath.trim()) return filePath;
  }
  return undefined;
}

function queryExtension(connection: ConnectionOptions, notebook: boolean): QueryFileExtension {
  if (notebook) return "sqlbook";
  if (connection.type === "ElasticSearch") return "es";
  if (connection.type === "MongoDB") return "dbclient-js";
  return "sql";
}

function queryTemplate(connection: ConnectionOptions, notebook: boolean): string {
  if (notebook) return "";
  if (connection.type === "ElasticSearch") {
    return "GET /index/_search\n{\n  \"query\": {\n    \"match_all\": {}\n  }\n}";
  }
  return "";
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

  const saveConnection = async (value: unknown, group?: string): Promise<void> => {
    const payload = withTargetGroup(value, group);
    const connection = asConnection(payload);
    if (!connection) {
      throw new Error("Connection id and type are required");
    }
    const candidate = targetRecord(payload);
    const globalScope = typeof candidate.global === "boolean"
      ? candidate.global
      : typeof candidate.isGlobal === "boolean"
        ? candidate.isGlobal
        : undefined;
    await services.connectionConfig.saveConnection(connection, globalScope);
  };

  const queryConnection = (target?: unknown): ConnectionOptions | undefined =>
    targetConnection(target) || services.activeConnection.get();

  const queryDirectory = (connection: ConnectionOptions, target?: unknown): string => {
    const directory = targetRecord(target).directory;
    return typeof directory === "string" && directory.trim()
      ? directory
      : services.queries.defaultDirectory(connection);
  };

  const showQueryFile = async (filePath: string): Promise<unknown> => {
    if (!services.queries.isQueryFile(filePath)) {
      throw new Error("The selected file is not a supported query file");
    }
    if (path.extname(filePath).toLowerCase() === ".sqlbook") {
      return vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(filePath), "sql-book");
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    return vscode.window.showTextDocument(document);
  };

  const runMongoDump = async (
    operation: MongoDumpOperation,
    target?: unknown,
  ): Promise<unknown> => {
    const connection = queryConnection(target);
    if (!connection) throw new Error("No active MongoDB connection");
    if (connection.type !== "MongoDB") {
      throw new Error(`MongoDB dump is not supported for ${connection.type}`);
    }
    const executablePath = await services.mongoDump.findExecutable(operation);
    if (!executablePath) {
      throw new Error(
        `${operation === "dump" ? "mongodump" : "mongorestore"} was not found. Install MongoDB Database Tools and try again.`,
      );
    }
    const candidate = targetRecord(target);
    const contextValue = String(candidate.contextValue || "");
    const database = typeof candidate.database === "string"
      ? candidate.database
      : connection.database;
    const collection = contextValue === "mongoCollection" && typeof candidate.label === "string"
      ? candidate.label
      : undefined;
    const connectionName = (connection.name || connection.host || "mongo")
      .replace(/[\\/:*?"<>|]/g, "_");
    const location = operation === "dump"
      ? await vscode.window.showSaveDialog({
        saveLabel: "Dump",
        defaultUri: vscode.Uri.file(
          path.join(os.homedir(), "Downloads", `${connectionName}-dump`),
        ),
        filters: { "MongoDB Dump": [""] },
      })
      : (await vscode.window.showOpenDialog({
        openLabel: "Restore",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
      }))?.[0];
    if (!location) return undefined;
    const result = await services.mongoDump.run(connection, operation, {
      executablePath,
      path: location.fsPath,
      database,
      collection,
    });
    await vscode.window.showInformationMessage(
      operation === "dump" ? "MongoDB dump completed." : "MongoDB restore completed.",
    );
    return result;
  };

  const openUtility = async (
    route: string,
    title: string,
    target?: unknown,
  ): Promise<vscode.WebviewPanel> => {
    const state = { target, connection: targetConnection(target) };
    const targetRecord = target && typeof target === "object" && !Array.isArray(target)
      ? target as Record<string, unknown>
      : undefined;
      const webviewState = {
        route,
        connection: state.connection,
        openDump: targetRecord?.openDump === true,
        resetMock: targetRecord?.resetMock === true,
        path: typeof (target as { path?: unknown } | undefined)?.path === "string"
        ? (target as { path: string }).path
        : undefined,
    };
    return openRoute(
      title,
      route,
      route,
      webviewState,
      (handler) => {
        const execute = async (content: unknown): Promise<void> => {
          const connection = state.connection || services.activeConnection.get();
          const source = typeof content === "string" ? content.trim() : "";
          if ((route === "xterm" || route === "sshTerminal") && connection?.type === "SSH" && source) {
            const session = await services.ssh.open(connection as import("../remote/sshService").SshConnectionOptions);
            const result = await session.exec(source);
            await handler.send("result", result);
            return;
          }
          if (connection && source && /^(SELECT|SHOW|DESCRIBE|EXPLAIN|GET|POST|PUT|PATCH|DELETE|LIST|PRODUCE|CREATE|DROP|ALTER|INSERT|UPDATE|USE|MATCH|SET|RESET)\b/i.test(source)) {
            try {
              const result = await services.connections.query(connection, source);
              await handler.setWebviewState({ ...webviewState, sql: source, ...result });
              await handler.send("result", { sql: source, ...result });
            } catch (error) {
              await handler.send("error", error instanceof Error ? error.message : String(error));
            }
            return;
          }
          await handler.send("result", {
            route,
            action: "execute",
            content,
            state: webviewState,
          });
        };
        handler.on("execute", execute);
        if (route !== "sshTerminal") {
          handler.on("input", execute);
        }
        handler.on("refresh", async () => {
          await handler.send("setState", webviewState);
        });
        handler.on("close", async () => {
          await handler.send("result", { route, action: "close" });
        });
        registerWebviewUtilityProtocols({
          route,
          target,
          state,
          webviewState,
          services,
          handler,
          openUtility,
        });
      },
    );
  };

  const openResult = async <Row>(
    title: string,
    sql: string,
    result: QueryResult<Row>,
    connection?: ConnectionOptions,
    tableContext?: {
      readonly table?: string;
      readonly schema?: string | null;
      readonly database?: string | null;
    },
  ): Promise<vscode.WebviewPanel> => {
    const state: ResultState = {
      title,
      sql,
      baseSql: sql,
      sourceSql: sql,
      rows: result.rows as unknown[],
      fields: result.fields,
      dbType: connection?.type,
      affectedRows: result.affectedRows,
      dirty: false,
      pageNum: 1,
      pageSize: services.config.get("defaultSelectLimit"),
      serverPaging: true,
      ...tableContext,
    };
    return openRoute(
      "SQL Result",
      "result",
      "result",
      state,
      (handler) => {
        bindResultProtocols({
          services,
          handler,
          state,
          connection,
          openText,
          openHistory: () => openRoute("SQL History", "history", "center/console", {
            history: services.state.get("sql.history", []),
          }),
          openConsole: async () => vscode.commands.executeCommand("mysql.console.open"),
          openErDiagram: () => openErDiagramPanel(services, {
            connection: connection || services.activeConnection.get(),
            table: tableContext?.table,
            schema: tableContext?.schema,
            database: tableContext?.database,
          }),
        });
      },
    );
  };

  const runTargetSql = async (
    target: unknown,
    sql: string,
  ): Promise<QueryResult<Record<string, unknown>>> => {
    const connection = targetConnection(target) || services.activeConnection.get();
    if (!connection) {
      throw new Error("No active database connection");
    }
    return services.connections.query(connection, sql);
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
      const group = targetGroup(target);
      const initialConnection = current
        ? withTargetGroup(current, group)
        : group
          ? { group }
          : undefined;
      return openRoute(
        mode === "create" ? "New Connection" : "Edit Connection",
        "connect",
        "connect",
        { mode, connection: initialConnection },
        (handler) => {
          handler.on("saveConnection", (value) => saveConnection(value, group));
          handler.on("save", (value) => saveConnection(value, group));
          handler.on("connect", async (value) => {
            try {
              const connection = asConnection(value);
              if (!connection) {
                throw new Error("Connection id and type are required");
              }
              await saveConnection(connection, group);
              await services.connections.getConnection(connection);
              services.activeConnection.set(connection);
              await handler.send("connectResult", `Connected to ${connection.name || connection.id}.`);
            } catch (error) {
              await handler.send("error", error instanceof Error ? error.message : String(error));
            }
          });
        },
      );
    },

    openConsole() {
      const consoleState: Record<string, unknown> = {};
      return openRoute(
        "Database Client Settings",
        "console",
        "center/console",
        consoleState,
        (handler) => {
          registerWebviewUtilityProtocols({
            route: "console",
            state: consoleState,
            webviewState: consoleState,
            services,
            handler,
            openUtility,
            openConnectionConfig: async (workspace = false) => {
              return services.connectionConfig.open(workspace);
            },
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
      const resolvedSql = ["MongoDB", "ElasticSearch", "Neo4j"].includes(connection.type)
        ? source
        : await services.sqlVariables.resolve(source, vscode.window.activeTextEditor?.document);
      let result: QueryResult<Record<string, unknown>>;
      const started = Date.now();
      try {
        result = await services.connections.query(connection, resolvedSql);
        services.sqlDecorations.recordSuccess(
          vscode.window.activeTextEditor?.document,
          source,
          result,
        );
      } catch (error) {
        services.sqlDecorations.recordFailure(
          vscode.window.activeTextEditor?.document,
          source,
          error,
        );
        throw error;
      }
      try {
        await recordSqlHistory(services.state, {
          sql: resolvedSql,
          date: Date.now(),
          costTime: Date.now() - started,
          dbType: connection.type,
        });
        void vscode.commands.executeCommand("mysql.history.refresh");
      } catch (error) {
        services.logger.warn("SQL history could not be persisted", error);
      }
      if (options.json) {
        return openText(JSON.stringify(result.rows, null, 2), "json");
      }
      return openResult("SQL Result", resolvedSql, result, connection);
    },

    async runCodeLens(target) {
      const candidate = targetRecord(target);
      const source = typeof target === "string"
        ? target
        : documentText(target) || (typeof candidate.source === "string" ? candidate.source : "");
      if (!source.trim()) {
        throw new Error("The CodeLens target contains no executable content");
      }
      return this.runSql(source, {
        newView: candidate.newTab === true,
        json: candidate.json === true,
      });
    },

    async selectCodeLens(uriValue, rangeValue) {
      const editor = editorForUri(uriValue);
      if (!editor || !(rangeValue instanceof vscode.Range)) {
        throw new Error("The SQL CodeLens selection target is no longer available");
      }
      editor.selection = new vscode.Selection(rangeValue.start, rangeValue.end);
      editor.revealRange(rangeValue, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    },

    async runAi(uriValue, rangeValue, provider = "copilot") {
      const editor = editorForUri(uriValue);
      if (!editor || !(rangeValue instanceof vscode.Range)) {
        throw new Error("The SQL CodeLens AI target is no longer available");
      }
      editor.selection = new vscode.Selection(rangeValue.start, rangeValue.end);
      editor.revealRange(rangeValue, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      return provider === "cursor"
        ? vscode.commands.executeCommand("aipopup.action.modal.generate", editor)
        : vscode.commands.executeCommand("inlineChat.start");
    },

    async resetMock(target) {
      const candidate = targetRecord(target);
      return openUtility("mock", "Data Mock", {
        ...candidate,
        resetMock: true,
      });
    },

    async runElasticQuery(request, parse = false) {
      return this.runSql(elasticRequestSource(request), { json: parse });
    },

    async openElasticDocument(request) {
      const slug = elasticDocumentSlug(request);
      if (!slug) {
        throw new Error("No Elasticsearch API documentation is available for this path");
      }
      await vscode.env.openExternal(
        vscode.Uri.parse(
          `https://www.elastic.co/guide/en/elasticsearch/reference/master/${slug}.html`,
        ),
      );
    },

    async copyElasticAsCurl(request) {
      const connection = services.activeConnection.get();
      if (!connection) throw new Error("No active Elasticsearch connection");
      await vscode.env.clipboard.writeText(elasticCurlSource(targetRecord(request), connection));
      void vscode.window.showInformationMessage("cURL has been copied to the clipboard.");
    },

    async lintElastic(request) {
      const editor = vscode.window.activeTextEditor;
      const candidate = targetRecord(request);
      const bodyStart = typeof candidate.bodyStart === "number" ? candidate.bodyStart : undefined;
      const bodyEnd = typeof candidate.bodyEnd === "number" ? candidate.bodyEnd : undefined;
      if (!editor || bodyStart === undefined || bodyEnd === undefined) {
        throw new Error("The Elasticsearch request body is not available in the active editor");
      }
      const start = editor.document.positionAt(bodyStart);
      const end = editor.document.positionAt(bodyEnd);
      const body = candidate.body;
      if (body === undefined) {
        throw new Error("The Elasticsearch request body is invalid");
      }
      await editor.edit((edit) => {
        edit.replace(new vscode.Range(start, end), formatElasticBody(body));
      });
    },

    async resetDdlTemplate(connectionValue, createTypeValue, uriValue, rangeValue) {
      const connection = targetConnection(connectionValue) || services.activeConnection.get();
      if (!connection) throw new Error("No active database connection");
      if (!(uriValue instanceof vscode.Uri) || !(rangeValue instanceof vscode.Range)) {
        throw new Error("A document URI and replacement range are required");
      }
      const template = ddlTemplate(
        services.dialects.resolve(connection.type),
        String(createTypeValue || ""),
      )?.replace(/\$\d+/g, "").trim();
      if (!template) {
        throw new Error(`DDL template is not supported for ${String(createTypeValue || "object")}`);
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uriValue, rangeValue, template);
      return vscode.workspace.applyEdit(edit);
    },

    sendMessage(document) {
      return services.messageCommands.send(document);
    },

    stopMessageProducer(document) {
      return services.messageCommands.stopProducer(document);
    },

    startMessageConsumer(document) {
      return services.messageCommands.startConsumer(document);
    },

    stopMessageConsumer(document) {
      return services.messageCommands.stopConsumer(document);
    },

    configureMessageOffset(document) {
      return services.messageCommands.configureOffset(document);
    },

    pullDockerCompose(target) {
      return services.dockerCompose.pull(target);
    },

    async openQuery(target) {
      const candidate = targetRecord(target);
      const newQuery = candidate.newQuery;
      if (typeof newQuery === "function") {
        return newQuery.call(target);
      }
      const open = candidate.open;
      if (typeof open === "function") {
        return open.call(target);
      }
      const filePath = targetQueryFile(target);
      if (filePath) {
        return showQueryFile(filePath);
      }
      const paginationSql = candidate.getPaginationSql;
      if (typeof paginationSql === "function") {
        return openText(String(paginationSql.call(target)));
      }
      const content = candidate.content || candidate.sql;
      if (typeof content === "string") {
        return openText(content, "sql");
      }
      const connection = asConnection(target) || services.activeConnection.get();
      const name = connection?.id || "query";
      return openText(`-- ${name}\nSELECT 1;`);
    },

    async addQuery(target, notebook = false) {
      const connection = queryConnection(target);
      if (!connection) throw new Error("No active database connection");
      const extension = queryExtension(connection, notebook);
      const name = await vscode.window.showInputBox({
        title: notebook ? "New SQL Book" : "New Query",
        prompt: "Query name",
        value: `New_Query_${Date.now()}`,
      });
      if (!name?.trim()) return undefined;
      const filePath = await services.queries.create(
        queryDirectory(connection, target),
        name,
        extension,
        queryTemplate(connection, notebook),
      );
      return showQueryFile(filePath);
    },

    async renameQuery(target) {
      const filePath = targetQueryFile(target);
      if (!filePath) throw new Error("A saved query file must be selected");
      const currentName = path.basename(filePath, path.extname(filePath));
      const name = await vscode.window.showInputBox({
        title: "Rename Query",
        prompt: "New query name",
        value: currentName,
      });
      if (!name?.trim()) return undefined;
      const renamed = await services.queries.rename(filePath, name);
      return showQueryFile(renamed);
    },

    async deleteQuery(target) {
      const filePath = targetQueryFile(target);
      if (!filePath) throw new Error("A saved query file must be selected");
      const name = path.basename(filePath);
      const answer = await vscode.window.showWarningMessage(
        `Delete query ${name}?`,
        { modal: true },
        "Delete",
      );
      if (answer !== "Delete") return undefined;
      await services.queries.remove(filePath);
      return filePath;
    },

    async linkQueryFolder(target) {
      const connection = queryConnection(target);
      if (!connection) throw new Error("No active database connection");
      const folders = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Link Query Folder",
      });
      const folder = folders?.[0];
      if (!folder) return undefined;
      const linked = services.state.get<Record<string, unknown>>("mysql.query.linkedFolders", {});
      const current = linked[queryScopeKey(connection)];
      const linkedFolders = Array.isArray(current)
        ? current.filter((item): item is string => typeof item === "string")
        : typeof current === "string"
          ? [current]
          : [];
      if (!linkedFolders.includes(folder.fsPath)) linkedFolders.push(folder.fsPath);
      await services.state.update("mysql.query.linkedFolders", {
        ...linked,
        [queryScopeKey(connection)]: linkedFolders,
      });
      return folder.fsPath;
    },

    async mongoDump(target) {
      return runMongoDump("dump", target);
    },

    async mongoRestore(target) {
      return runMongoDump("restore", target);
    },

    async openNotebook(mode = "new") {
      if (mode === "open") {
        const files = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: "Open SQL Book",
          filters: { "SQL Book": ["sqlbook"] },
        });
        const file = files?.[0];
        if (!file) return undefined;
        return vscode.commands.executeCommand("vscode.openWith", file, "sql-book");
      }
      const notebook = await vscode.workspace.openNotebookDocument(
        "sql-book",
        new vscode.NotebookData([
          new vscode.NotebookCellData(vscode.NotebookCellKind.Code, "", "sql"),
        ]),
      );
      return vscode.window.showNotebookDocument(notebook);
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

    async viewHistory(target) {
      const value = target && typeof target === "object" && !Array.isArray(target)
        ? (target as { entry?: unknown }).entry ?? target
        : target;
      const entry = normalizeSqlHistoryEntry(value);
      if (!entry) {
        throw new Error("The SQL history item is no longer available");
      }
      return openText(sqlHistoryDocument(entry));
    },

    async clearHistory() {
      await services.state.update("sql.history", []);
      void vscode.commands.executeCommand("mysql.history.refresh");
    },

    async serverInfo(target) {
      const connection = targetConnection(target) || services.activeConnection.get();
      if (!connection) {
        throw new Error("No database connection selected");
      }
      return openUtility("manager", `Status@${connection.name || connection.host || connection.id}`, target);
    },

    async filterChildren(target) {
      const candidate = target as { setFilter?: (value: string) => void; filter?: string } | undefined;
      if (candidate && typeof candidate.setFilter === "function") {
        const value = await vscode.window.showInputBox({
          prompt: "Filter children",
          value: typeof candidate.filter === "string" ? candidate.filter : "",
        });
        if (value !== undefined) candidate.setFilter(value);
      }
      return target;
    },

    activateDatabase(target) {
      const connection = targetConnection(target);
      if (!connection) {
        return services.activeConnection.get();
      }
      const value = target as { database?: unknown; schema?: unknown } | undefined;
      const active = {
        ...connection,
        database: typeof value?.database === "string" ? value.database : connection.database,
        schema: typeof value?.schema === "string" ? value.schema : connection.schema,
      };
      services.activeConnection.set(active);
      return active;
    },

    async generateDocument(target) {
      const candidate = target as { showDdl?: () => Promise<string> | string } | undefined;
      const source = typeof candidate?.showDdl === "function"
        ? await candidate.showDdl()
        : "# Database document\n\nSelect a database object to generate its DDL.";
      return openText(source, "markdown");
    },

    async importSql(target) {
      const files = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: "Import SQL",
        filters: { SQL: ["sql", "ddl"], "All files": ["*"] },
      });
      const file = files?.[0];
      if (!file) {
        return undefined;
      }
      const source = await readFile(file.fsPath, "utf8");
      const connection = targetConnection(target) || services.activeConnection.get();
      if (!connection) {
        throw new Error("No database connection selected");
      }
      const blocks = parseSqlBlocks(source);
      const results: QueryResult<Record<string, unknown>>[] = [];
      for (const block of blocks) {
        results.push(await services.connections.query(connection, block.text));
      }
      const last = results.at(-1) || { rows: [], fields: [] };
      return openResult(`Imported ${file.fsPath}`, source, {
        ...last,
        rows: [{ statements: blocks.length, affectedRows: results.reduce((sum, item) => sum + (item.affectedRows || 0), 0) }],
        fields: [{ name: "statements" }, { name: "affectedRows" }],
      }, connection);
    },

    async createMock(target) {
      const candidate = target as {
        label?: unknown;
        getColumnNodes?: () => Promise<unknown[]>;
        getChildren?: () => Promise<unknown[]>;
      } | undefined;
      const children = typeof candidate?.getColumnNodes === "function"
        ? await candidate.getColumnNodes()
        : typeof candidate?.getChildren === "function" ? await candidate.getChildren() : [];
      const mock = {
        table: String(candidate?.label || "table_name"),
        mockStartIndex: "auto",
        mockCount: 10,
        mockValueReference: "https://mockjs.com/examples.html",
        mock: Object.fromEntries(children.map((column) => [String((column as { label?: unknown }).label || "column"), { type: "varchar", value: "@string('lower',5)" }])),
      };
      return openText(JSON.stringify(mock, null, 2), "json");
    },

    async runMock(target) {
      return openUtility("mock", "Data Mock", target);
    },

    async changeTableName(target) {
      const candidate = target as { tableWithSchema?: unknown; label?: unknown } | undefined;
      const oldName = String(candidate?.tableWithSchema || candidate?.label || "");
      if (!oldName) {
        throw new Error("A table must be selected");
      }
      const newName = await vscode.window.showInputBox({ prompt: "New table name", value: String(candidate?.label || "") });
      if (!newName || newName === String(candidate?.label || "")) {
        return undefined;
      }
      const connection = targetConnection(target) || services.activeConnection.get();
      const result = await runTargetSql(target, `ALTER TABLE ${oldName} RENAME TO ${services.dialects.resolve(connection?.type || "MySQL").quoteIdentifier(newName)};`);
      return openResult(`Rename ${newName}`, "ALTER TABLE", result, connection);
    },

    async fullTextSearch(target) {
      const candidate = target as { tableWithSchema?: unknown; label?: unknown } | undefined;
      const table = String(candidate?.tableWithSchema || candidate?.label || "tables");
      const term = await vscode.window.showInputBox({ prompt: `Search ${table}` });
      if (!term) {
        return undefined;
      }
      const connection = targetConnection(target) || services.activeConnection.get();
      const searchTarget = target as {
        tableWithSchema?: unknown;
        label?: unknown;
        fullTextSQL?: (value: string) => Promise<string | null> | string | null;
        getChildren?: () => Promise<unknown[]>;
      } | undefined;
      if (typeof searchTarget?.fullTextSQL === "function") {
        const sql = await searchTarget.fullTextSQL(term);
        if (!sql) {
          return openResult(`Search ${term}`, "", {
            rows: [],
            fields: [{ name: "message" }],
          }, connection);
        }
        const result = await runTargetSql(target, sql);
        return openResult(`Search ${term}`, sql, result, connection);
      }
      if (typeof searchTarget?.getChildren === "function") {
        const matches: Record<string, unknown>[] = [];
        const tables: FullTextSearchTarget[] = await collectFullTextSearchTargets(searchTarget);
        for (const table of tables) {
          if (typeof table.fullTextSQL !== "function") continue;
          const sql = await table.fullTextSQL(term);
          if (!sql) {
            continue;
          }
          try {
            const result = await runTargetSql(table, sql);
            if (result.rows.length > 0) {
              matches.push({
                table: String(table.label || ""),
                count: result.rows.length,
                sql,
              });
            }
          } catch {
            // A single table failing must not hide matches from other tables.
          }
        }
        return openResult(`Search ${term}`, `-- Full text search: ${term}`, {
          rows: matches,
          fields: [{ name: "table" }, { name: "count" }, { name: "sql" }],
        }, connection);
      }
      throw new Error("Full-text search requires a table or table-group target");
    },

    openUtility,

    async runDockerCompose(target) {
      const candidate = target as {
        newComposeTemplate?: () => Promise<unknown> | unknown;
      } | undefined;
      if (typeof candidate?.newComposeTemplate === "function") {
        return candidate.newComposeTemplate();
      }
      return openUtility("xterm", "Docker Compose", target);
    },

    collapseTrees(noSql = false) {
      return vscode.commands.executeCommand("workbench.action.collapseAll").then(() => noSql);
    },
  };
}
