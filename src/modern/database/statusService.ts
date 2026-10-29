import type { DatabaseType, QueryField, QueryResult } from "./types";

export interface StatusTable {
  readonly fields: readonly QueryField[];
  readonly rows: readonly Record<string, unknown>[];
}

export interface StatusSeriesPoint {
  readonly now: string;
  readonly type: string;
  readonly value: number;
}

export interface DatabaseDashboard {
  readonly queries: readonly StatusSeriesPoint[];
  readonly traffic: readonly StatusSeriesPoint[];
  readonly variables: StatusTable;
}

export type StatusQuery = <Row extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
) => Promise<QueryResult<Row>>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function rowsOf(result: QueryResult<Record<string, unknown>>): Record<string, unknown>[] {
  return Array.isArray(result.rows) ? result.rows.map(record) : [];
}

function tableOf(result: QueryResult<Record<string, unknown>>): StatusTable {
  return {
    fields: result.fields,
    rows: rowsOf(result),
  };
}

function numeric(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function nowLabel(date: Date): string {
  const hour = date.getHours() % 12 || 12;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(hour)}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function lookupCaseInsensitive(
  source: Record<string, unknown>,
  key: string,
): unknown {
  const actualKey = Object.keys(source).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return actualKey ? source[actualKey] : undefined;
}

function statusMap(rows: readonly Record<string, unknown>[]): Record<string, unknown> {
  return Object.fromEntries(rows.map((row) => {
    const name = lookupCaseInsensitive(row, "variable_name") ?? lookupCaseInsensitive(row, "name");
    const value = lookupCaseInsensitive(row, "value") ?? row.Value;
    return [String(name ?? ""), value];
  }).filter(([name]) => Boolean(name)));
}

export function buildMysqlDashboard(
  statusRows: readonly Record<string, unknown>[],
  variableTable: StatusTable,
  date = new Date(),
): DatabaseDashboard {
  const status = statusMap(statusRows);
  const now = nowLabel(date);
  return {
    queries: [
      { now, type: "insert", value: numeric(status.Com_insert) },
      { now, type: "update", value: numeric(status.Com_update) },
      { now, type: "delete", value: numeric(status.Com_delete) },
      { now, type: "select", value: numeric(status.Com_select) },
      { now, type: "read", value: numeric(status.Innodb_rows_read) },
    ],
    traffic: [
      { now, type: "received", value: numeric(status.Bytes_received) },
      { now, type: "sent", value: numeric(status.Bytes_sent) },
    ],
    variables: variableTable,
  };
}

export function buildPostgresDashboard(
  statisticRow: Record<string, unknown>,
  variableTable: StatusTable,
  date = new Date(),
): DatabaseDashboard {
  const now = nowLabel(date);
  return {
    queries: [
      { now, type: "insert", value: numeric(statisticRow.tup_inserted) },
      { now, type: "update", value: numeric(statisticRow.tup_updated) },
      { now, type: "delete", value: numeric(statisticRow.tup_deleted) },
      { now, type: "select", value: numeric(statisticRow.tup_returned) },
      { now, type: "fetched", value: numeric(statisticRow.tup_fetched) },
    ],
    traffic: [
      { now, type: "read", value: numeric(statisticRow.blks_read) },
      { now, type: "hit", value: numeric(statisticRow.blks_hit) },
    ],
    variables: variableTable,
  };
}

function postgresStatisticsSql(): string {
  return `
    SELECT
      coalesce(sum(tup_inserted), 0) AS tup_inserted,
      coalesce(sum(tup_updated), 0) AS tup_updated,
      coalesce(sum(tup_deleted), 0) AS tup_deleted,
      coalesce(sum(tup_returned), 0) AS tup_returned,
      coalesce(sum(tup_fetched), 0) AS tup_fetched,
      coalesce(sum(blks_read), 0) AS blks_read,
      coalesce(sum(blks_hit), 0) AS blks_hit
    FROM pg_stat_database
    WHERE datname IS NOT NULL;
  `;
}

function postgresVariablesSql(): string {
  return `
    SELECT name AS "Variable_name", setting AS "Value"
    FROM pg_settings
    WHERE name IN (
      'port',
      'server_version',
      'log_min_duration_statement',
      'track_activities',
      'data_directory',
      'config_file'
    );
  `;
}

function isMysql(type: DatabaseType): boolean {
  return type === "MySQL" || type === "MariaDB";
}

function isPostgres(type: DatabaseType): boolean {
  return ["PostgreSQL", "Redshift", "Kingbase", "GaussDB", "Cockroach", "PostgreCompatible"].includes(type);
}

export async function loadDatabaseDashboard(
  type: DatabaseType,
  query: StatusQuery,
): Promise<DatabaseDashboard> {
  if (isMysql(type)) {
    const status = await query("SHOW GLOBAL STATUS;");
    const variables = await query("SHOW GLOBAL VARIABLES;");
    return buildMysqlDashboard(rowsOf(status), tableOf(variables));
  }
  if (isPostgres(type)) {
    const statistics = await query(postgresStatisticsSql());
    const variables = await query(postgresVariablesSql());
    return buildPostgresDashboard(record(statistics.rows[0]), tableOf(variables));
  }
  return {
    queries: [],
    traffic: [],
    variables: { fields: [], rows: [] },
  };
}

export { isMysql, isPostgres, nowLabel, postgresStatisticsSql, postgresVariablesSql };
