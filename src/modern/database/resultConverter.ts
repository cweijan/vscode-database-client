import type { QueryField, QueryResult } from "./types";
import { formatResultValue } from "./resultValues";

export interface DriverQueryResult {
  rows?: unknown;
  fields?: unknown;
  affectedRows?: unknown;
  rowCount?: unknown;
  [key: string]: unknown;
}

function normalizeRows(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.filter(
      (row) => row !== null && typeof row === "object",
    );
  }
  if (value !== null && typeof value === "object") {
    return [value as Record<string, unknown>];
  }
  return [];
}

function rowsWithFields(
  value: unknown,
  fields: readonly QueryField[],
): Record<string, unknown>[] {
  return normalizeRows(value).flatMap((row) => {
    if (Array.isArray(row)) {
      return [Object.fromEntries(fields.map((field, index) => [field.name, row[index]]))];
    }
    return row && typeof row === "object"
      ? [row as Record<string, unknown>]
      : [];
  });
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
    const normalizedFields = normalizeFields(fields);
    if (
      rows !== null &&
      typeof rows === "object" &&
      !Array.isArray(rows) &&
      typeof (rows as Record<string, unknown>).affectedRows === "number"
    ) {
      return {
        rows: [],
        fields: normalizedFields,
        affectedRows: (rows as Record<string, unknown>).affectedRows as number,
        raw: value,
      };
    }
    return {
      rows: rowsWithFields(rows, normalizedFields) as Row[],
      fields: normalizedFields,
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
    rows: rowsWithFields(result.rows, normalizeFields(result.fields)) as Row[],
    fields: normalizeFields(result.fields),
    affectedRows,
    raw: value,
  };
}

function fieldType(field: QueryField | undefined): string {
  if (!field) return "";
  const candidate = field.type ?? field.simpleType;
  return typeof candidate === "string" ? candidate : String(candidate ?? "");
}

function rowFieldType(fields: readonly QueryField[], name: string, index: number): string {
  const field = fields.find((candidate) =>
    candidate.name.toLowerCase() === name.toLowerCase());
  return fieldType(field || fields[index]);
}

function formatResultRow(row: unknown, fields: readonly QueryField[]): unknown {
  if (Array.isArray(row)) {
    return row.map((value, index) => formatResultValue(value, fieldType(fields[index])));
  }
  if (!row || typeof row !== "object") return row;
  const values = row as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(values).map(([name, value], index) => [
      name,
      formatResultValue(value, rowFieldType(fields, name, index)),
    ]),
  );
}

export function normalizeResultValues<Row = Record<string, unknown>>(
  result: QueryResult<Row>,
): QueryResult<Row> {
  return {
    ...result,
    rows: result.rows.map((row) => formatResultRow(row, result.fields) as Row),
  };
}
