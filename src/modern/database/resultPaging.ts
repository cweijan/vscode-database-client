import type { DatabaseType } from "./types";

export interface ResultPageRequest {
  readonly pageNum: number;
  readonly pageSize: number;
}

export interface ResultFilter {
  readonly column: string;
  readonly operator: string;
  readonly value: string;
}

function pageNumber(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}

function pageSize(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 100));
}

function baseSelect(sql: string): string | undefined {
  const value = sql.trim().replace(/;+\s*$/g, "");
  if (!/^(select|with)\b/i.test(value)) return undefined;
  return value
    .replace(/\s+limit\s+\d+(?:\s+offset\s+\d+)?\s*$/i, "")
    .replace(/\s+offset\s+\d+\s+rows\s+fetch\s+next\s+\d+\s+rows\s+only\s*$/i, "")
    .replace(/\s+fetch\s+first\s+\d+\s+rows\s+only\s*$/i, "")
    .replace(/^select\s+top\s+\d+\s+/i, "SELECT ");
}

function isSqlServer(type: DatabaseType): boolean {
  return type === "SqlServer" || type === "AzureSQLServer" || type === "MSSQL";
}

function isOracle(type: DatabaseType): boolean {
  return type === "Oracle" || type === "DM";
}

function quoteResultIdentifier(identifier: string, type: DatabaseType): string | undefined {
  const parts = identifier.split(".").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(part))) {
    return undefined;
  }
  if (type === "MySQL" || type === "MariaDB" || type === "MySQLCompatible") {
    return parts.map((part) => `\`${part.replaceAll("`", "``")}\``).join(".");
  }
  if (isSqlServer(type)) {
    return parts.map((part) => `[${part.replaceAll("]", "]]")}]`).join(".");
  }
  return parts.map((part) => `"${part.replaceAll('"', '""')}"`).join(".");
}

function insertPredicate(base: string, predicate: string): string {
  const clause = base.match(/\s+(ORDER\s+BY|GROUP\s+BY|HAVING)\b/i);
  const splitAt = clause?.index ?? base.length;
  const head = base.slice(0, splitAt).trimEnd();
  const tail = base.slice(splitAt);
  const conjunction = /\bWHERE\b/i.test(head) ? " AND " : " WHERE ";
  return `${head}${conjunction}${predicate}${tail}`;
}

function filterLiteral(value: string, operator: string): string {
  const trimmed = value.trim();
  if (operator === "LIKE" || operator === "NOT LIKE") {
    return `'${trimmed.replaceAll("'", "''")}'`;
  }
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return trimmed;
  return `'${trimmed.replaceAll("'", "''")}'`;
}

export function buildResultFilterSql(
  sql: string,
  type: DatabaseType,
  column: string,
  operator: string,
  value: string,
): string | undefined {
  const base = baseSelect(sql);
  const identifier = quoteResultIdentifier(column, type);
  if (!base || !identifier) return undefined;
  const normalizedOperator = operator.toUpperCase();
  if (!["=", "!=", "<>", ">", ">=", "<", "<=", "LIKE", "NOT LIKE", "IS", "IS NOT"].includes(normalizedOperator)) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return `${base};`;
  if (trimmed.toUpperCase() === "NULL") {
    const nullOperator = normalizedOperator === "IS NOT" || normalizedOperator === "!=" || normalizedOperator === "<>"
      ? "IS NOT"
      : "IS";
    return `${insertPredicate(base, `${identifier} ${nullOperator} NULL`)};`;
  }
  return `${insertPredicate(base, `${identifier} ${normalizedOperator} ${filterLiteral(trimmed, normalizedOperator)}`)};`;
}

export function buildResultFiltersSql(
  sql: string,
  type: DatabaseType,
  filters: readonly ResultFilter[],
): string | undefined {
  let result = sql;
  for (const filter of filters) {
    const next = buildResultFilterSql(
      result,
      type,
      filter.column,
      filter.operator,
      filter.value,
    );
    if (!next) return undefined;
    result = next;
  }
  return result;
}

export function buildResultSortSql(
  sql: string,
  type: DatabaseType,
  column: string,
  descending: boolean,
): string | undefined {
  const base = baseSelect(sql);
  const identifier = quoteResultIdentifier(column, type);
  if (!base || !identifier) return undefined;
  const withoutOrder = base.replace(/\s+ORDER\s+BY[\s\S]*$/i, "").trimEnd();
  return `${withoutOrder} ORDER BY ${identifier} ${descending ? "DESC" : "ASC"};`;
}

export function buildResultPageSql(
  sql: string,
  type: DatabaseType,
  request: ResultPageRequest,
): string | undefined {
  const base = baseSelect(sql);
  if (!base) return undefined;
  const page = pageNumber(request.pageNum);
  const size = pageSize(request.pageSize);
  const offset = (page - 1) * size;
  if (isSqlServer(type)) {
    return `${base} ORDER BY (SELECT 1) OFFSET ${offset} ROWS FETCH NEXT ${size} ROWS ONLY;`;
  }
  if (isOracle(type)) {
    return `${base} OFFSET ${offset} ROWS FETCH NEXT ${size} ROWS ONLY`;
  }
  return `${base} LIMIT ${size} OFFSET ${offset};`;
}

export function buildResultCountSql(
  sql: string,
  type?: DatabaseType,
): string | undefined {
  const base = baseSelect(sql);
  if (!base) return undefined;
  const alias = type && isOracle(type)
    ? "dbclient_count_query"
    : "AS dbclient_count_query";
  return `SELECT COUNT(*) AS dbclient_count FROM (${base}) ${alias};`;
}

export function resultCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const key = Object.keys(row).find((name) => name.toLowerCase() === "dbclient_count" || name.toLowerCase() === "count");
  if (!key) return undefined;
  const count = Number(row[key]);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : undefined;
}

export { baseSelect, pageNumber, pageSize };
