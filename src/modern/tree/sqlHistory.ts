import type { StateStore } from "../core/contracts";

export const SQL_HISTORY_STATE_KEY = "sql.history";
export const SQL_HISTORY_LIMIT = 300;

export interface SqlHistoryEntry {
  readonly sql: string;
  readonly date: number;
  readonly costTime: number;
  readonly dbType: string;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeSqlHistoryEntry(value: unknown): SqlHistoryEntry | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as {
    sql?: unknown;
    date?: unknown;
    costTime?: unknown;
    dbType?: unknown;
  };
  if (typeof candidate.sql !== "string" || !candidate.sql.trim()) {
    return undefined;
  }
  const date = candidate.date instanceof Date
    ? candidate.date.getTime()
    : finiteNumber(candidate.date, Date.now());
  return {
    sql: candidate.sql,
    date,
    costTime: finiteNumber(candidate.costTime, 0),
    dbType: typeof candidate.dbType === "string" ? candidate.dbType : "",
  };
}

export function readSqlHistory(value: unknown): SqlHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(normalizeSqlHistoryEntry)
    .filter((entry): entry is SqlHistoryEntry => entry !== undefined);
}

export function appendSqlHistory(
  history: readonly SqlHistoryEntry[],
  entry: SqlHistoryEntry,
  limit = SQL_HISTORY_LIMIT,
): SqlHistoryEntry[] {
  const boundedLimit = Math.max(1, Math.floor(limit));
  return [...history, entry].slice(-boundedLimit);
}

export function compactSqlHistoryLabel(sql: string): string {
  const oneLine = sql.replace(/[\r\n]+/g, " ").trim();
  return oneLine.length > 20 ? `${oneLine.slice(0, 20)}...` : oneLine;
}

export function sqlHistoryDocument(entry: SqlHistoryEntry): string {
  const date = new Date(entry.date).toISOString();
  const databaseType = entry.dbType || "Unknown database";
  return `-- ${date} [${entry.costTime} ms] - ${databaseType}\n${entry.sql}`;
}

export async function recordSqlHistory(
  state: StateStore,
  entry: SqlHistoryEntry,
): Promise<void> {
  const history = readSqlHistory(state.get<unknown>(SQL_HISTORY_STATE_KEY, []));
  await state.update(
    SQL_HISTORY_STATE_KEY,
    appendSqlHistory(history, entry),
  );
}
