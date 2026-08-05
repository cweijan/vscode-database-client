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

function asResultRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function resultFieldNames(
  fields: unknown,
  rows: readonly unknown[],
): string[] {
  const names = Array.isArray(fields)
    ? fields
      .map((field) => String(asResultRecord(field).name || asResultRecord(field).columnName || ""))
      .filter(Boolean)
    : [];
  if (names.length > 0) return names;
  const first = rows[0];
  return first && typeof first === "object" ? Object.keys(first) : [];
}

function resultCellText(value: unknown): string {
  if (value == null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function csvCell(value: unknown): string {
  const text = resultCellText(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function serializeResult(
  rows: readonly unknown[],
  fields: unknown,
  format: "json" | "csv",
): string {
  if (format === "json") return JSON.stringify(rows, null, 2);
  const columns = resultFieldNames(fields, rows);
  const lines = [
    columns.map(csvCell).join(","),
    ...rows.map((row) => {
      const source = asResultRecord(row);
      return columns.map((column) => csvCell(source[column])).join(",");
    }),
  ];
  return lines.join("\n") + "\n";
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
  ): Promise<vscode.WebviewPanel> => {
    const state = {
      title,
      sql,
      rows: result.rows as unknown[],
      fields: result.fields,
      affectedRows: result.affectedRows,
      dirty: false,
    };
    return openRoute(
      "SQL Result",
      "result",
      "result",
      state,
      (handler) => {
        const publishState = async (): Promise<void> => {
          await handler.setWebviewState({ ...state });
        };
        handler.on("copyResult", async (content) => {
          const payload = asResultRecord(content);
          const rows = Array.isArray(payload.rows) ? payload.rows : state.rows;
          const columns = Array.isArray(payload.columns)
            ? payload.columns.map(String)
            : resultFieldNames(state.fields, rows);
          const text = rows.map((row) => {
            const record = asResultRecord(row);
            return (columns.length > 0 ? columns : Object.keys(record))
              .map((column) => resultCellText(record[column]))
              .join("\t");
          }).join("\n");
          await vscode.env.clipboard.writeText(text);
        });
        const exportResult = async (content: unknown): Promise<void> => {
          const payload = asResultRecord(content);
          const rows = Array.isArray(payload.rows) ? payload.rows : state.rows;
          const fields = payload.fields || state.fields;
          const file = await vscode.window.showSaveDialog({
            saveLabel: "Export result",
            filters: { JSON: ["json"], CSV: ["csv"] },
          });
          if (!file) return;
          const format = file.fsPath.toLowerCase().endsWith(".csv") ? "csv" : "json";
          await writeFile(file.fsPath, serializeResult(rows, fields, format), "utf8");
        };
        handler.on("exportResult", exportResult);
        handler.on("export", async (content) => {
          const payload = asResultRecord(content);
          const rows = Array.isArray(payload.rows) ? payload.rows : state.rows;
          const fields = payload.fields || state.fields;
          if (payload.exportToEditor === true) {
            await openText(serializeResult(rows, fields, "json"), "json");
            await handler.send("export_done", { exportToEditor: true, success: true });
            return;
          }
          await exportResult({ ...payload, rows, fields });
          await handler.send("export_done", { exportToEditor: false, success: true });
        });
        handler.on("saveModify", async (content) => {
          try {
            const payload = asResultRecord(content);
            const statements = Array.isArray(payload.sqlList)
              ? payload.sqlList.map(String).filter(Boolean)
              : payload.sql ? [String(payload.sql)] : [];
            if (statements.length === 0) throw new Error("No update SQL was provided");
            const selected = connection || services.activeConnection.get();
            if (!selected) throw new Error("No active database connection");
            let affectedRows = 0;
            for (const statement of statements) {
              const update = await services.connections.query(selected, statement);
              affectedRows += update.affectedRows || 0;
            }
            state.affectedRows = affectedRows;
            state.dirty = false;
            await publishState();
            await handler.send("updateSuccess", {
              message: `Update completed; affected ${affectedRows} row(s).`,
              affectedRows,
            });
            await handler.send("clearSaveState");
          } catch (error) {
            await handler.send("ERROR", {
              sql: asResultRecord(content).sql,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });
        handler.on("syncRow", async (content) => {
          const payload = asResultRecord(content);
          const index = Number(payload.index);
          const field = String(payload.field || "");
          if (payload.isNew === true && payload.newRow && typeof payload.newRow === "object") {
            state.rows.push(payload.newRow);
          } else if (Number.isInteger(index) && index >= 0 && index < state.rows.length && field) {
            const row = asResultRecord(state.rows[index]);
            row[field] = payload.value;
            state.rows[index] = row;
          }
          state.dirty = true;
          await publishState();
        });
        handler.on("dataModify", async () => {
          state.dirty = true;
          await publishState();
        });
        handler.on("clearSaveState", async () => {
          state.dirty = false;
          await publishState();
        });
        handler.on("viewJSON", async () => {
          await openText(JSON.stringify(state.rows, null, 2), "json");
        });
        handler.on("editInVSCode", async (content) => {
          const source = typeof content === "string" ? content : state.sql;
          await openText(source || "", "sql");
        });
        handler.on("viewHistory", async () => {
          await openRoute("SQL History", "history", "center/console", {
            history: services.state.get("sql.history", []),
          });
        });
        handler.on("exportFile", async (content) => {
          const payload = asResultRecord(content);
          const column = asResultRecord(payload.column);
          const raw = payload.content;
          const file = await vscode.window.showSaveDialog({
            saveLabel: "Export cell",
            filters: { File: ["*"] },
            defaultUri: vscode.Uri.file(`${String(column.name || "value")}.txt`),
          });
          if (!file) return;
          const bytes = payload.isBinary === true && typeof raw === "string"
            ? Buffer.from(raw.replace(/^0x/i, ""), "hex")
            : Buffer.from(resultCellText(raw), "utf8");
          await writeFile(file.fsPath, bytes);
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
      return openResult("SQL Result", source, result, connection);
    },

    async openQuery(target) {
      const candidate = target as {
        newQuery?: () => Promise<unknown> | unknown;
        getPaginationSql?: () => string;
      } | undefined;
      if (typeof candidate?.newQuery === "function") {
        return candidate.newQuery();
      }
      if (typeof candidate?.getPaginationSql === "function") {
        return openText(candidate.getPaginationSql());
      }
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
      return openResult(`${connection.name || connection.id} · server info`, sql, result, connection);
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
      }, connection);
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
        for (const child of await searchTarget.getChildren()) {
          const table = child as {
            label?: unknown;
            fullTextSQL?: (value: string) => Promise<string | null> | string | null;
          };
          if (typeof table.fullTextSQL !== "function") {
            continue;
          }
          const sql = await table.fullTextSQL(term);
          if (!sql) {
            continue;
          }
          try {
            const result = await runTargetSql(child, sql);
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
