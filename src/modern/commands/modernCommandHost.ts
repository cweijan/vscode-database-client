import * as vscode from "vscode";
import { readFile, writeFile } from "node:fs/promises";

import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions, QueryResult } from "../database/types";
import { parseSqlBlocks } from "../providers/sqlDocumentModel";
import { registerWebviewUtilityProtocols } from "./webviewUtilityProtocols";

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
  serverInfo?(target?: unknown): Promise<unknown>;
  filterChildren?(target?: unknown): Promise<unknown> | unknown;
  activateDatabase?(target?: unknown): Promise<unknown> | unknown;
  generateDocument?(target?: unknown): Promise<unknown>;
  importSql?(target?: unknown): Promise<unknown>;
  createMock?(target?: unknown): Promise<unknown>;
  runMock?(target?: unknown): Promise<unknown>;
  changeTableName?(target?: unknown): Promise<unknown>;
  fullTextSearch?(target?: unknown): Promise<unknown>;
  userAction?(operation: "grant" | "change" | "template" | "delete", target?: unknown): Promise<unknown>;
  openUtility?(route: string, title: string, target?: unknown): Promise<unknown>;
  runDockerCompose?(target?: unknown): Promise<unknown>;
  collapseTrees?(noSql?: boolean): Promise<unknown> | unknown;
}

function asConnection(value: unknown): ConnectionOptions | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const item = value as Partial<ConnectionOptions>;
  return item.id && item.type ? (item as ConnectionOptions) : undefined;
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

  const openUtility = async (
    route: string,
    title: string,
    target?: unknown,
  ): Promise<vscode.WebviewPanel> => {
    const state = { target, connection: targetConnection(target) };
    const webviewState = {
      route,
      connection: state.connection,
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
        handler.on("input", execute);
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
        });
      },
    );
  };

  const openResult = async <Row>(
    title: string,
    sql: string,
    result: QueryResult<Row>,
  ): Promise<vscode.WebviewPanel> => {
    const state = {
      title,
      sql,
      rows: result.rows,
      fields: result.fields,
      affectedRows: result.affectedRows,
    };
    return openRoute(
      "SQL Result",
      "result",
      "result",
      state,
      (handler) => {
        handler.on("copyResult", async (content) => {
          const payload = content && typeof content === "object"
            ? content as { columns?: unknown[]; rows?: unknown[] }
            : {};
          const columns = Array.isArray(payload.columns) ? payload.columns.map(String) : [];
          const rows = Array.isArray(payload.rows) ? payload.rows : [];
          const text = rows.map((row) => {
            const record = row && typeof row === "object" ? row as Record<string, unknown> : {};
            return (columns.length > 0 ? columns : Object.keys(record))
              .map((column) => String(record[column] ?? ""))
              .join("\t");
          }).join("\n");
          await vscode.env.clipboard.writeText(text);
        });
        handler.on("exportResult", async (content) => {
          const payload = content && typeof content === "object"
            ? content as { columns?: unknown[]; rows?: unknown[] }
            : {};
          const rows = Array.isArray(payload.rows) ? payload.rows : [];
          const file = await vscode.window.showSaveDialog({
            saveLabel: "Export result",
            filters: { JSON: ["json"], CSV: ["csv"] },
          });
          if (!file) return;
          await writeFile(file.fsPath, JSON.stringify(rows, null, 2), "utf8");
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
      return openRoute(
        mode === "create" ? "New Connection" : "Edit Connection",
        "connect",
        "connect",
        { mode, connection: current },
        (handler) => {
          handler.on("saveConnection", (value) => saveConnection(value));
          handler.on("save", (value) => saveConnection(value));
          handler.on("connect", async (value) => {
            try {
              const connection = asConnection(value);
              if (!connection) {
                throw new Error("Connection id and type are required");
              }
              await saveConnection(connection);
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
      return openResult("SQL Result", source, result);
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

    async serverInfo(target) {
      const connection = targetConnection(target) || services.activeConnection.get();
      if (!connection) {
        throw new Error("No database connection selected");
      }
      const dialect = services.dialects.resolve(connection.type);
      const sql = dialect.showVersion?.() || "SELECT 1 AS server_version;";
      const result = await services.connections.query(connection, sql);
      return openResult(`${connection.name || connection.id} · server info`, sql, result);
    },

    filterChildren(target) {
      const candidate = target as { setFilter?: (value: string) => void; filter?: string } | undefined;
      if (candidate && typeof candidate.setFilter === "function") {
        candidate.setFilter("");
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
      });
    },

    async createMock(target) {
      const candidate = target as { label?: unknown; getChildren?: () => Promise<unknown[]> } | undefined;
      const children = typeof candidate?.getChildren === "function" ? await candidate.getChildren() : [];
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
      const result = await runTargetSql(target, `ALTER TABLE ${oldName} RENAME TO ${services.dialects.resolve((targetConnection(target) || services.activeConnection.get())?.type || "MySQL").quoteIdentifier(newName)};`);
      return openResult(`Rename ${newName}`, "ALTER TABLE", result);
    },

    async fullTextSearch(target) {
      const candidate = target as { tableWithSchema?: unknown; label?: unknown } | undefined;
      const table = String(candidate?.tableWithSchema || candidate?.label || "");
      const term = await vscode.window.showInputBox({ prompt: `Search ${table}` });
      if (!term) {
        return undefined;
      }
      const result = await runTargetSql(target, `SELECT * FROM ${table} LIMIT 100;`);
      return openResult(`Search ${term}`, `SELECT * FROM ${table}`, result);
    },

    async userAction(operation, target) {
      const candidate = target as { showSource?: () => Promise<string> | string } | undefined;
      if (operation === "template") {
        return openText("CREATE USER user_name IDENTIFIED BY 'password';\nGRANT ALL PRIVILEGES ON *.* TO user_name;", "sql");
      }
      if (typeof candidate?.showSource === "function") {
        return openText(await candidate.showSource(), "sql");
      }
      return openUtility("manager", `User ${operation}`, target);
    },

    openUtility,

    async runDockerCompose(target) {
      return openUtility("xterm", "Docker Compose", target);
    },

    collapseTrees(noSql = false) {
      return vscode.commands.executeCommand("workbench.action.collapseAll").then(() => noSql);
    },
  };
}
