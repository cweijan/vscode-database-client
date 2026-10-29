import type { ConnectionOptions, DatabaseType } from "./types";

export type TableSortRule = "Default" | "Rows Count" | "Data Size";

export const DEFAULT_TABLE_SORT_RULE: TableSortRule = "Default";

export function tableSortStateKey(
  connection: Pick<ConnectionOptions, "id" | "type">,
  schema: string | null | undefined,
): string {
  return `mysql.table.sort:${connection.id}:${connection.type}:${schema || ""}`;
}

export function supportsTableDataSize(
  type: DatabaseType,
): boolean {
  return type === "MySQL" ||
    type === "MariaDB" ||
    type === "PostgreSQL" ||
    type === "Redshift" ||
    type === "Kingbase" ||
    type === "GaussDB" ||
    type === "Cockroach" ||
    type === "PostgreCompatible" ||
    type === "SqlServer" ||
    type === "AzureSQLServer" ||
    type === "MSSQL" ||
    type === "ClickHouse" ||
    type === "Doris" ||
    type === "Oracle";
}

export function tableSortOptions(type: DatabaseType): readonly TableSortRule[] {
  return supportsTableDataSize(type)
    ? ["Default", "Rows Count", "Data Size"]
    : ["Default", "Rows Count"];
}

function numericValue(row: Record<string, unknown>, ...names: string[]): number {
  for (const name of names) {
    const value = Number(row[name]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function rowName(row: Record<string, unknown>): string {
  const value = row.name ?? row.table_name ?? row.TABLE_NAME;
  return value == null ? "" : String(value);
}

export function sortTableMetadata(
  rows: readonly Record<string, unknown>[],
  rule: TableSortRule,
): Record<string, unknown>[] {
  return [...rows].sort((left, right) => {
    if (rule === "Rows Count") {
      const difference = numericValue(right, "table_rows", "rows", "TABLE_ROWS") -
        numericValue(left, "table_rows", "rows", "TABLE_ROWS");
      if (difference !== 0) {
        return difference;
      }
    }
    if (rule === "Data Size") {
      const difference = numericValue(right, "data_length", "data_size", "length", "DATA_LENGTH") -
        numericValue(left, "data_length", "data_size", "length", "DATA_LENGTH");
      if (difference !== 0) {
        return difference;
      }
    }
    return rowName(left).localeCompare(rowName(right), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
}
