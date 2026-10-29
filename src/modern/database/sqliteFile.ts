export interface SqliteResultLike {
  readonly columns: readonly string[];
  readonly values: readonly (readonly unknown[])[];
}

export interface SqliteDatabaseLike {
  exec(sql: string): readonly SqliteResultLike[];
}

export interface SqliteFileTable {
  readonly name: string;
  readonly type: "table" | "view";
  readonly rowCount: number;
}

export interface SqliteFilePage {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
  readonly total: number;
}

export function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function countSqliteRows(
  database: SqliteDatabaseLike,
  table: string,
): number {
  try {
    const result = database.exec(
      `SELECT COUNT(*) AS cnt FROM ${quoteSqliteIdentifier(table)};`,
    )[0];
    const count = Number(result?.values[0]?.[0] ?? 0);
    return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  } catch {
    return 0;
  }
}

export function listSqliteTables(
  database: SqliteDatabaseLike,
): SqliteFileTable[] {
  const result = database.exec(
    "SELECT name, type FROM sqlite_master "
      + "WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' "
      + "ORDER BY name;",
  )[0];
  if (!result) return [];

  const nameIndex = result.columns.findIndex((column) => column.toLowerCase() === "name");
  const typeIndex = result.columns.findIndex((column) => column.toLowerCase() === "type");
  if (nameIndex < 0 || typeIndex < 0) return [];

  return result.values.flatMap((row) => {
    const name = String(row[nameIndex] ?? "");
    if (!name || name.startsWith("sqlite_")) return [];
    const type = String(row[typeIndex] ?? "").toLowerCase() === "view"
      ? "view"
      : "table";
    return [{ name, type, rowCount: countSqliteRows(database, name) }];
  });
}

export function readSqlitePage(
  database: SqliteDatabaseLike,
  table: string,
  pageNum: number,
  pageSize: number,
): SqliteFilePage {
  const normalizedPage = Math.max(1, Math.floor(pageNum) || 1);
  const normalizedSize = Math.max(1, Math.floor(pageSize) || 1);
  const offset = (normalizedPage - 1) * normalizedSize;
  const total = countSqliteRows(database, table);
  const result = database.exec(
    `SELECT * FROM ${quoteSqliteIdentifier(table)} LIMIT ${normalizedSize} OFFSET ${offset};`,
  )[0];
  if (!result) return { columns: [], rows: [], total };

  const rows = result.values.map((values) => Object.fromEntries(
    result.columns.map((column, index) => [column, values[index]]),
  ));
  return { columns: [...result.columns], rows, total };
}
