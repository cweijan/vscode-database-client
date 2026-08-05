import type { QueryField, QueryResult } from "./types";

export interface DriverQueryResult {
  rows?: unknown;
  fields?: unknown;
  affectedRows?: unknown;
  rowCount?: unknown;
  [key: string]: unknown;
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(
      (row): row is Record<string, unknown> =>
        row !== null && typeof row === "object",
    );
  }
  if (value !== null && typeof value === "object") {
    return [value as Record<string, unknown>];
  }
  return [];
}

function normalizeFields(value: unknown): QueryField[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((field, index) => {
    if (typeof field === "string") {
      return { name: field };
    }
    if (field && typeof field === "object") {
      const record = field as Record<string, unknown>;
      return {
        ...record,
        name:
          typeof record.name === "string"
            ? record.name
            : typeof record.columnName === "string"
              ? record.columnName
              : "column_" + index,
      };
    }
    return { name: "column_" + index };
  });
}

export function normalizeDriverResult<Row = Record<string, unknown>>(
  value: unknown,
): QueryResult<Row> {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    Array.isArray(value[1]) &&
    (Array.isArray(value[0]) || (value[0] !== null && typeof value[0] === "object"))
  ) {
    const rows = value[0];
    const fields = value[1];
    return {
      rows: normalizeRows(rows) as Row[],
      fields: normalizeFields(fields),
      raw: value,
    };
  }
  const result =
    value && typeof value === "object"
      ? (value as DriverQueryResult)
      : { rows: value };
  const affectedRows =
    typeof result.affectedRows === "number"
      ? result.affectedRows
      : typeof result.rowCount === "number"
        ? result.rowCount
        : undefined;
  return {
    rows: normalizeRows(result.rows) as Row[],
    fields: normalizeFields(result.fields),
    affectedRows,
    raw: value,
  };
}
