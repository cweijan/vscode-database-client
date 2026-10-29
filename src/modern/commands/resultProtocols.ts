import { readFile, writeFile } from "node:fs/promises";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { TypedWebviewHandler } from "../core/webviewHandler";
import {
  buildResultCountSql,
  buildResultFiltersSql,
  buildResultPageSql,
  buildResultSortSql,
  baseSelect,
  type ResultFilter,
  resultCount,
} from "../database/resultPaging";
import {
  buildResultMutationSql,
  buildResultImportSql,
  type ResultMutationContext,
  type ResultMutationRequest,
} from "../database/resultMutations";
import {
  serializeResultExport,
  type ResultCsvDelimiter,
  type ResultCsvEncoding,
  type ResultExportFormat,
  type ResultExportOptions,
} from "../database/resultExport";
import { importFormatFromPath, parseResultImportFile } from "../database/resultImport";
import { normalizeResultParameterLists } from "../database/resultParameters";
import { resultBinaryBase64, resultValueText } from "../database/resultValues";
import type { ConnectionOptions, DatabaseType, QueryField, QueryResult } from "../database/types";
import { parseSqlBlocks } from "../providers/sqlDocumentModel";

export interface ResultState {
  title: string;
  sql: string;
  baseSql: string;
  sourceSql?: string;
  rows: unknown[];
  fields: QueryField[];
  columnList?: QueryField[];
  primaryKey?: string;
  primaryKeyList?: QueryField[];
  tableCount?: number;
  dbType?: DatabaseType;
  affectedRows?: number;
  dirty: boolean;
  connection?: ConnectionOptions;
  table?: string;
  schema?: string | null;
  database?: string | null;
  readonly?: boolean;
  readOnly?: boolean;
  pageNum: number;
  pageSize: number;
  total?: number;
  serverPaging?: boolean;
  filters?: ResultFilter[];
  sort?: { column: string; descending: boolean };
}

export interface ResultProtocolContext {
  readonly services: ExtensionServices;
  readonly handler: TypedWebviewHandler;
  readonly state: ResultState;
  readonly connection?: ConnectionOptions;
  readonly openText: (content: string, language?: string) => Promise<unknown>;
  readonly openHistory: () => Promise<unknown>;
  readonly openConsole?: () => Promise<unknown>;
  readonly openErDiagram?: () => Promise<unknown>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cellText(value: unknown): string {
  return resultValueText(value);
}

function binaryBuffer(value: unknown): Buffer | undefined {
  const base64 = resultBinaryBase64(value);
  return base64 === undefined ? undefined : Buffer.from(base64, "base64");
}

function fieldNames(fields: readonly QueryField[], rows: readonly unknown[]): string[] {
  const names = fields
    .map((field) => String(field.name || field.columnName || ""))
    .filter(Boolean);
  if (names.length > 0) return names;
  const first = rows[0];
  return first && typeof first === "object" && !Array.isArray(first) ? Object.keys(first) : [];
}

function elasticRequest(sql: string, patch: Record<string, unknown>): string {
  const match = sql.trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)(?:\n([\s\S]*))?$/i);
  if (!match) throw new Error("The Elasticsearch result request cannot be rewritten");
  let body: Record<string, unknown> = {};
  if (match[3]?.trim()) body = record(JSON.parse(match[3]) as unknown);
  return `${match[1].toUpperCase()} ${match[2]}\n${JSON.stringify({ ...body, ...patch })}`;
}

function normalizeExportFormat(value: unknown): ResultExportFormat {
  switch (String(value || "JSON").toUpperCase()) {
    case "XLSX":
    case "EXCEL":
      return "XLSX";
    case "CSV":
      return "CSV";
    case "SQL":
      return "SQL";
    case "MD":
    case "MARKDOWN":
      return "Markdown";
    default:
      return "JSON";
  }
}

function normalizeCsvEncoding(value: unknown): ResultCsvEncoding {
  return String(value || "UTF8").toUpperCase() === "GBK" ? "GBK" : "UTF8";
}

function normalizeCsvDelimiter(value: unknown): ResultCsvDelimiter {
  const normalized = String(value || "comma").toLowerCase();
  return normalized === "tab" || normalized === "semicolon" || normalized === "space"
    ? normalized
    : "comma";
}

function resultExportRequest(payload: Record<string, unknown>): {
  readonly options: ResultExportOptions;
  readonly exportToEditor: boolean;
  readonly withOutLimit: boolean;
} {
  const option = record(payload.option);
  const value = (name: string): unknown => payload[name] ?? option[name];
  return {
    options: {
      type: normalizeExportFormat(value("type")),
      exportSQL: value("exportSQL") === true,
      csvEncoding: normalizeCsvEncoding(value("csvEncoding")),
      csvDelimiter: normalizeCsvDelimiter(value("csvDelimiter")),
    },
    exportToEditor: value("exportToEditor") === true,
    withOutLimit: value("withOutLimit") === true,
  };
}

function queryFields(value: unknown, fallback: readonly QueryField[]): QueryField[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.map((item) => {
    const field = record(item);
    const name = String(field.name || field.columnName || "");
    return name ? { ...field, name } : undefined;
  }).filter((field): field is QueryField => field !== undefined);
}

function normalizeFilters(value: unknown): ResultFilter[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const filter = record(item);
    const column = String(filter.column || "").trim();
    if (!column) return undefined;
    return {
      column,
      operator: String(filter.operator || "=").toUpperCase(),
      value: String(filter.value ?? ""),
    };
  }).filter((filter): filter is ResultFilter => filter !== undefined && filter.value.length > 0);
}

function filtersFromPayload(payload: Record<string, unknown>, state: ResultState): ResultFilter[] {
  if (Array.isArray(payload.filters)) return normalizeFilters(payload.filters);
  const column = String(payload.column || "").trim();
  const current = [...(state.filters || [])];
  if (!column) return current;
  const next = current.filter((filter) => filter.column.toLowerCase() !== column.toLowerCase());
  if (payload.clearColumn === true || String(payload.value ?? "").trim() === "") return next;
  return [...next, {
    column,
    operator: String(payload.operator || "=").toUpperCase(),
    value: String(payload.value ?? ""),
  }];
}

function elasticFilterClause(filter: ResultFilter): Record<string, unknown> {
  const operator = filter.operator.toUpperCase();
  if ((operator === "IS" || operator === "IS NOT") && filter.value.toUpperCase() === "NULL") {
    const exists = { exists: { field: filter.column } };
    return operator === "IS" ? { bool: { must_not: [exists] } } : exists;
  }
  if ([">", ">=", "<", "<="].includes(operator)) {
    const rangeOperator = operator === ">" ? "gt" : operator === ">=" ? "gte" : operator === "<" ? "lt" : "lte";
    return { range: { [filter.column]: { [rangeOperator]: filter.value } } };
  }
  if (operator === "LIKE" || operator === "NOT LIKE") {
    const wildcard = filter.value.replaceAll("%", "*").replaceAll("_", "?");
    const clause = { wildcard: { [filter.column]: wildcard } };
    return operator === "NOT LIKE" ? { bool: { must_not: [clause] } } : clause;
  }
  return { match: { [filter.column]: filter.value } };
}

function elasticFilterQuery(filters: readonly ResultFilter[]): Record<string, unknown> {
  if (filters.length === 0) return { match_all: {} };
  return { bool: { must: filters.map(elasticFilterClause) } };
}

function sqlResultQuery(
  state: ResultState,
  connection: ConnectionOptions,
): string {
  const source = state.sourceSql || state.baseSql || state.sql;
  const filtered = buildResultFiltersSql(source, connection.type, state.filters || []);
  if (!filtered) throw new Error("The selected result filters cannot be applied safely");
  if (!state.sort) return filtered;
  return buildResultSortSql(
    filtered,
    connection.type,
    state.sort.column,
    state.sort.descending,
  ) || filtered;
}

function pageRequest(content: unknown, state: ResultState): { pageNum: number; pageSize: number } {
  const payload = record(content);
  const page = record(payload.page);
  const pageNum = Math.max(1, Math.floor(Number(payload.pageNum || page.pageNum) || state.pageNum || 1));
  const pageSize = Math.max(1, Math.floor(Number(payload.pageSize || page.pageSize) || state.pageSize || 100));
  return { pageNum, pageSize };
}

function selectedConnection(context: ResultProtocolContext): ConnectionOptions | undefined {
  return context.connection || context.state.connection || context.services.activeConnection.get();
}

function mutationContext(
  context: ResultProtocolContext,
  connection: ConnectionOptions,
): ResultMutationContext {
  const dbType = context.state.dbType || connection.type;
  return {
    dbType,
    dialect: dbType === "MongoDB" || dbType === "ElasticSearch"
      ? undefined
      : context.services.dialects.resolve(dbType),
    database: context.state.database || connection.database,
    schema: context.state.schema || connection.schema,
    table: context.state.table,
    fields: context.state.fields,
    columnList: context.state.columnList,
    primaryKey: context.state.primaryKey,
    primaryKeyList: context.state.primaryKeyList,
  };
}

async function sendError(handler: TypedWebviewHandler, error: unknown, sql?: string): Promise<void> {
  await handler.send("ERROR", {
    sql,
    message: error instanceof Error ? error.message : String(error),
  });
}

async function publish(context: ResultProtocolContext): Promise<void> {
  await context.handler.setWebviewState({ ...context.state });
}

async function queryResult(
  context: ResultProtocolContext,
  sql: string,
  type?: DatabaseType,
  signal?: AbortSignal,
): Promise<QueryResult<Record<string, unknown>>> {
  const connection = selectedConnection(context);
  if (!connection) throw new Error("No active database connection");
  const result = await context.services.connections.query<Record<string, unknown>>(
    connection,
    sql,
    signal ? { signal } : undefined,
  );
  context.state.rows = result.rows;
  context.state.fields = result.fields;
  context.state.affectedRows = result.affectedRows;
  context.state.sql = sql;
  context.state.baseSql = context.state.baseSql || sql;
  context.state.dbType = connection.type;
  if (type) context.state.connection = { ...connection, type };
  return result;
}

export function bindResultProtocols(context: ResultProtocolContext): void {
  const { handler, state } = context;
  let activeQueryController: AbortController | undefined;
  const sendCurrent = async (): Promise<void> => {
    await publish(context);
    await handler.send("table_info", {
      singleTable: Boolean(state.table),
      dbType: state.dbType,
    });
    await handler.send("db_info", {
      database: state.database,
      schema: state.schema,
    });
    await handler.send("result", { ...state });
  };

  handler.on("route-result", sendCurrent);
  handler.on("openConsole", async () => {
    if (context.openConsole) {
      await context.openConsole();
      return;
    }
    await handler.send("ERROR", { message: "The SQL Console is not available in this result context." });
  });
  handler.on("stopExecute", () => {
    activeQueryController?.abort();
    activeQueryController = undefined;
  });
  handler.on("copyResult", async (content) => {
    const payload = record(content);
    const rows = Array.isArray(payload.rows) ? payload.rows : state.rows;
    const columns = Array.isArray(payload.columns)
      ? payload.columns.map(String)
      : fieldNames(state.fields, rows);
    const text = rows.map((item) => {
      const row = record(item);
      return (columns.length > 0 ? columns : Object.keys(row))
        .map((column) => cellText(row[column]))
        .join("\t");
    }).join("\n");
    await vscode.env.clipboard.writeText(text);
  });

  const runExport = async (content: unknown): Promise<boolean> => {
    const payload = record(content);
    const option = record(payload.option);
    const request = resultExportRequest(payload);
    const connection = selectedConnection(context);
    let rows = Array.isArray(payload.rows) ? payload.rows : state.rows;
    let fields = queryFields(payload.fields, state.fields);
    let sql = String(payload.sql || option.sql || state.sql);
    if (request.withOutLimit) {
      if (!connection) throw new Error("A database connection is required for full-result export");
      const source = state.sourceSql || state.baseSql || state.sql;
      const exportSql = connection.type === "ElasticSearch" ? source : baseSelect(source) || source;
      const result = await context.services.connections.query(connection, exportSql);
      rows = result.rows;
      fields = result.fields;
      sql = exportSql;
    }
    const dbType = connection?.type || state.dbType || "MySQL";
    const dialect = request.options.type === "SQL"
      ? context.services.dialects.resolve(dbType)
      : undefined;
    const tableValue = payload.table || option.table || state.table;
    const table = typeof tableValue === "string" && tableValue ? tableValue : undefined;
    const output = serializeResultExport({
      rows,
      fields,
      sql,
      dbType,
      dialect,
      table,
      schema: state.schema,
    }, request.options);
    if (request.exportToEditor) {
      if (!output.text) throw new Error("Binary XLSX export cannot be opened as a text editor");
      await context.openText(output.text, output.language);
      return true;
    }
    const safeTable = (table || "result").replace(/[\\/:*?"<>|]/g, "_");
    const file = await vscode.window.showSaveDialog({
      saveLabel: "Export result",
      defaultUri: vscode.Uri.file(safeTable + "-" + String(Date.now()) + "." + output.extension),
      filters: { [output.format]: [output.extension] },
    });
    if (!file) return false;
    await writeFile(file.fsPath, output.bytes);
    return true;
  };

  handler.on("exportResult", async (content) => { await runExport(content); });
  handler.on("export", async (content) => {
    const success = await runExport(content);
    const request = resultExportRequest(record(content));
    await handler.send("export_done", {
      exportToEditor: request.exportToEditor,
      success,
    });
  });
  handler.on("saveModify", async (content) => {
    try {
      const payload = record(content);
      let statements = Array.isArray(payload.sqlList)
        ? payload.sqlList.map(String).filter(Boolean)
        : payload.sql ? [String(payload.sql)] : [];
      const paramsList = normalizeResultParameterLists(payload.paramsList);
      const connection = selectedConnection(context);
      if (!connection) throw new Error("No active database connection");
      if (statements.length === 0) {
        const updates = Array.isArray(payload.updates)
          ? payload.updates
            .map((item): { current: Record<string, unknown>; original?: Record<string, unknown> } | undefined => {
              const candidate = record(item);
              const current = record(candidate.current || candidate.row);
              if (Object.keys(current).length === 0) return undefined;
              const original = candidate.original && typeof candidate.original === "object"
                ? record(candidate.original)
                : undefined;
              return { current, original };
            })
            .filter((item): item is { current: Record<string, unknown>; original?: Record<string, unknown> } => item !== undefined)
          : [];
        const mutationRequest: ResultMutationRequest = {
          updates,
          inserts: Array.isArray(payload.inserts)
            ? payload.inserts.map(record).filter((item) => Object.keys(item).length > 0)
            : [],
          deletes: Array.isArray(payload.deletes)
            ? payload.deletes.map(record).filter((item) => Object.keys(item).length > 0)
            : [],
        };
        statements = buildResultMutationSql(mutationContext(context, connection), mutationRequest);
      }
      if (statements.length === 0) throw new Error("No update SQL was provided");
      let affectedRows = 0;
      for (const [index, statement] of statements.entries()) {
        const params = paramsList?.[index];
        const result = await context.services.connections.query(connection, statement, params
          ? { params }
          : undefined);
        affectedRows += result.affectedRows || 0;
      }
      state.affectedRows = affectedRows;
      state.dirty = false;
      await publish(context);
      await handler.send("DML", {
        sql: statements.join("\n"),
        message: `Update completed; affected ${affectedRows} row(s).`,
        affectedRows,
      });
      await handler.send("updateSuccess", {
        message: `Update completed; affected ${affectedRows} row(s).`,
        affectedRows,
      });
      await handler.send("clearSaveState");
    } catch (error) {
      await sendError(handler, error, record(content).sql as string | undefined);
    }
  });
  handler.on("import", async (content) => {
    try {
      const payload = record(content);
      const importOptions = record(payload.options);
      const files = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: "Import rows",
        filters: { JSON: ["json"], CSV: ["csv"], XLSX: ["xlsx"], PARQUET: ["parquet"], SQL: ["sql"] },
      });
      const file = files?.[0];
      if (!file) return;
      const format = importFormatFromPath(file.fsPath);
      const sqlBlocks = format === "SQL"
        ? parseSqlBlocks(await readFile(file.fsPath, "utf8"))
        : [];
      const rows = format === "SQL"
        ? Array.from({ length: sqlBlocks.length }, () => ({}))
        : await parseResultImportFile(file.fsPath, format, {
          csvEncoding: normalizeCsvEncoding(payload.csvEncoding || importOptions.csvEncoding),
          csvDelimiter: normalizeCsvDelimiter(payload.csvDelimiter || importOptions.csvDelimiter),
        });
      if (rows.length === 0) throw new Error("The selected file contains no importable rows");
      const connection = selectedConnection(context);
      if (!connection) throw new Error("No active database connection");
      const mode = String(payload.mode || importOptions.mode || "insert").toLowerCase() === "upsert"
        ? "upsert"
        : "insert";
      const statements = format === "SQL"
        ? sqlBlocks.map((block) => block.text)
        : buildResultImportSql(mutationContext(context, connection), rows, {
          mode,
          skipPrimaryKey: payload.skipPrimaryKey === true || importOptions.skipPrimaryKey === true,
        });
      if (statements.length === 0) throw new Error("The imported columns do not match the result fields");
      let affectedRows = 0;
      for (const statement of statements) {
        const result = await context.services.connections.query(connection, statement);
        affectedRows += result.affectedRows || 0;
      }
      state.dirty = false;
      await handler.send("import_done", { success: true, count: rows.length, affectedRows });
      await handler.send("updateSuccess", {
        message: `Imported ${rows.length} row(s); affected ${affectedRows} row(s).`,
        affectedRows,
      });
    } catch (error) {
      await sendError(handler, error, state.sql);
      await handler.send("import_done", { success: false });
    }
  });
  handler.on("syncRow", async (content) => {
    const payload = record(content);
    const index = Number(payload.index);
    const field = String(payload.field || "");
    if (payload.isNew === true && payload.newRow && typeof payload.newRow === "object") {
      state.rows.push(payload.newRow);
    } else if (Number.isInteger(index) && index >= 0 && index < state.rows.length && field) {
      const row = record(state.rows[index]);
      row[field] = payload.value;
      state.rows[index] = row;
    }
    state.dirty = true;
    await publish(context);
  });
  handler.on("dataModify", async () => {
    state.dirty = true;
    await publish(context);
  });
  handler.on("clearSaveState", async () => {
    state.dirty = false;
    await publish(context);
  });
  handler.on("viewJSON", async () => {
    await context.openText(JSON.stringify(state.rows, null, 2), "json");
  });
  handler.on("editInVSCode", async (content) => {
    await context.openText(typeof content === "string" ? content : state.baseSql, "sql");
  });
  handler.on("viewHistory", async () => { await context.openHistory(); });
  handler.on("openErDiagram", async () => {
    if (!state.table) {
      await handler.send("error", "Select a single table before opening the ER diagram");
      return;
    }
    if (context.openErDiagram) await context.openErDiagram();
  });
  handler.on("exportFile", async (content) => {
    const payload = record(content);
    const column = record(payload.column);
    const file = await vscode.window.showSaveDialog({
      saveLabel: "Export cell",
      filters: { File: ["*"] },
      defaultUri: vscode.Uri.file(`${String(column.name || "value")}.txt`),
    });
    if (!file) return;
    const raw = payload.content;
    const binary = payload.isBinary === true ? binaryBuffer(raw) : undefined;
    const bytes = binary || (typeof raw === "string" && /^0x[0-9a-f]+$/i.test(raw)
      ? Buffer.from(raw.slice(2), "hex")
      : Buffer.from(cellText(raw), "utf8"));
    await writeFile(file.fsPath, bytes);
  });
  handler.on("loadFile", async (content) => {
    const payload = record(content);
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: "Load file value",
    });
    const file = files?.[0];
    if (!file) return;
    const bytes = await readFile(file.fsPath);
    const loaded = payload.isBinary === true ? bytes.toString("base64") : bytes.toString("utf8");
    if (payload.index == null) await handler.send("fileContent", loaded);
    else await handler.send("loadFile", { index: payload.index, name: payload.name, content: loaded });
  });
  handler.on("next", async (content) => {
    try {
      const connection = selectedConnection(context);
      if (!connection) throw new Error("No active database connection");
      const request = pageRequest(content, state);
      const sql = buildResultPageSql(state.baseSql || state.sql, connection.type, request);
      if (!sql) throw new Error("This result cannot be paged by the modern SQL adapter");
      const started = Date.now();
      const result = await queryResult(context, sql);
      state.pageNum = request.pageNum;
      state.pageSize = request.pageSize;
      await publish(context);
      await handler.send("NEXT_PAGE", {
        sql,
        data: result.rows,
        costTime: Date.now() - started,
        pageNum: request.pageNum,
        pageSize: request.pageSize,
      });
    } catch (error) {
      await sendError(handler, error, state.sql);
    }
  });
  handler.on("count", async () => {
    try {
      const connection = selectedConnection(context);
      if (!connection) throw new Error("No active database connection");
      const sql = buildResultCountSql(
        state.baseSql || state.sql,
        connection.type,
      );
      if (!sql) return;
      const result = await context.services.connections.query(connection, sql);
      const count = resultCount(result.rows[0]);
      if (count === undefined) return;
      state.total = count;
      await handler.send("COUNT", { data: count });
      await publish(context);
    } catch (error) {
      await sendError(handler, error, state.sql);
    }
  });
  handler.on("sort", async (content) => {
    try {
      const payload = record(content);
      const candidate = payload.sql;
      const connection = selectedConnection(context);
      if (!connection) throw new Error("No active database connection");
      const sortColumn = typeof payload.column === "string" ? payload.column : "";
      const descending = payload.descending === true;
      if (sortColumn) state.sort = { column: sortColumn, descending };
      const sql = typeof content === "string"
        ? content
        : typeof candidate === "string"
          ? candidate
          : sortColumn
            ? connection.type === "ElasticSearch"
              ? elasticRequest(state.sourceSql || state.sql, {
                query: elasticFilterQuery(state.filters || []),
                sort: [{ [sortColumn]: { order: descending ? "desc" : "asc" } }],
              })
              : sqlResultQuery(state, connection)
            : "";
      if (!sql) return;
      const result = await queryResult(context, sql);
      state.baseSql = sql;
      state.sql = sql;
      await publish(context);
      await handler.send("sort_result", { data: result.rows, sql });
    } catch (error) {
      const sql = typeof content === "string"
        ? content
        : typeof record(content).sql === "string" ? record(content).sql as string : undefined;
      await sendError(handler, error, sql);
    }
  });
  handler.on("executeSQL", async (content) => {
    const controller = new AbortController();
    activeQueryController?.abort();
    activeQueryController = controller;
    try {
      const payload = record(content);
      const sql = String(payload.sql || content || "").trim();
      if (!sql) return;
      const connection = selectedConnection(context);
      await handler.send("RUN", { sql, dbType: connection?.type || state.dbType });
      const result = await queryResult(context, sql, undefined, controller.signal);
      if (controller.signal.aborted) {
        await handler.send("MESSAGE", { success: true, message: "Query stopped." });
        return;
      }
      state.baseSql = sql;
      state.sourceSql = sql;
      state.filters = [];
      state.sort = undefined;
      state.pageNum = 1;
      await publish(context);
      const firstKeyword = /^\s*([A-Za-z]+)/.exec(sql)?.[1]?.toUpperCase() || "";
      const resultMessage = { ...result, sql };
      if (/^(INSERT|UPDATE|DELETE|MERGE|REPLACE|UPSERT)$/.test(firstKeyword)) {
        await handler.send("DML", resultMessage);
      } else if (/^(CREATE|ALTER|DROP|TRUNCATE|RENAME|COMMENT|GRANT|REVOKE)$/.test(firstKeyword)) {
        await handler.send("DDL", resultMessage);
      } else {
        await handler.send("DATA", resultMessage);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        await handler.send("MESSAGE", { success: true, message: "Query stopped." });
      } else {
        await sendError(handler, error);
      }
    } finally {
      if (activeQueryController === controller) activeQueryController = undefined;
    }
  });
  handler.on("filterResult", async (content) => {
    try {
      const payload = record(content);
      const connection = selectedConnection(context);
      if (!connection) throw new Error("No active database connection");
      const source = state.sourceSql || state.baseSql || state.sql;
      state.filters = filtersFromPayload(payload, state);
      const elasticPatch: Record<string, unknown> = {
        query: elasticFilterQuery(state.filters),
      };
      if (state.sort) {
        elasticPatch.sort = [{
          [state.sort.column]: { order: state.sort.descending ? "desc" : "asc" },
        }];
      }
      const sql = connection.type === "ElasticSearch"
        ? elasticRequest(source, elasticPatch)
        : sqlResultQuery(state, connection);
      if (!sql) throw new Error("The selected result column cannot be filtered safely");
      state.baseSql = sql;
      state.sql = sql;
      state.pageNum = 1;
      state.total = undefined;
      const result = await queryResult(context, sql);
      await publish(context);
      await handler.send("DATA", { ...result, sql });
    } catch (error) {
      await sendError(handler, error, state.sql);
    }
  });
  handler.on("esFilter", async (content) => {
    try {
      const connection = selectedConnection(context);
      if (!connection || connection.type !== "ElasticSearch") throw new Error("Elasticsearch connection is required");
      const sql = elasticRequest(state.baseSql || state.sql, { query: record(content).query || record(content) });
      const result = await queryResult(context, sql);
      state.baseSql = sql;
      state.sql = sql;
      state.pageNum = 1;
      state.total = undefined;
      await publish(context);
      await handler.send("DATA", { ...result, sql });
    } catch (error) {
      await sendError(handler, error, state.sql);
    }
  });
  handler.on("esSort", async (content) => {
    try {
      const connection = selectedConnection(context);
      if (!connection || connection.type !== "ElasticSearch") throw new Error("Elasticsearch connection is required");
      const sql = elasticRequest(state.baseSql || state.sql, { sort: record(content).sort || record(content) });
      const result = await queryResult(context, sql);
      state.baseSql = sql;
      state.sql = sql;
      await publish(context);
      await handler.send("sort_result", { data: result.rows, sql });
    } catch (error) {
      await sendError(handler, error, state.sql);
    }
  });
  handler.on("refresh", async () => {
    try {
      const result = await queryResult(context, state.baseSql || state.sql);
      state.pageNum = 1;
      state.total = result.rows.length;
      await sendCurrent();
    } catch (error) {
      await sendError(handler, error, state.sql);
    }
  });
}
