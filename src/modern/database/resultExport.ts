import AdmZip from "adm-zip";
import iconv from "iconv-lite";

import type { DatabaseType, Dialect, QueryField } from "./types";
import { resultValueExportText, resultValueOrigin } from "./resultValues";

export type ResultExportFormat = "XLSX" | "CSV" | "JSON" | "SQL" | "Markdown";
export type ResultCsvEncoding = "UTF8" | "GBK";
export type ResultCsvDelimiter = "comma" | "tab" | "semicolon" | "space";

export interface ResultExportOptions {
  readonly type: ResultExportFormat;
  readonly exportSQL?: boolean;
  readonly csvEncoding?: ResultCsvEncoding;
  readonly csvDelimiter?: ResultCsvDelimiter;
}

export interface ResultExportContext {
  readonly rows: readonly unknown[];
  readonly fields: readonly QueryField[];
  readonly sql: string;
  readonly dbType: DatabaseType;
  readonly dialect?: Dialect;
  readonly table?: string;
  readonly schema?: string | null;
}

export interface ResultExportOutput {
  readonly format: ResultExportFormat;
  readonly extension: string;
  readonly language: string;
  readonly text?: string;
  readonly bytes: Buffer;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fieldName(field: QueryField, index: number): string {
  return String(field.name || field.columnName || ("column_" + String(index + 1)));
}

function fieldNames(fields: readonly QueryField[], rows: readonly unknown[]): string[] {
  const names = fields.map(fieldName).filter(Boolean);
  if (names.length > 0) return names;
  const first = rows[0];
  if (first && typeof first === "object" && !Array.isArray(first)) {
    return Object.keys(first);
  }
  return [];
}

function rowValue(row: unknown, name: string, index: number): unknown {
  if (Array.isArray(row)) return row[index];
  const values = recordValue(row);
  if (name in values) return values[name];
  const key = Object.keys(values).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? values[key] : undefined;
}

function cellText(value: unknown, empty = ""): string {
  return resultValueExportText(value, empty);
}

function csvSeparator(delimiter: ResultCsvDelimiter | undefined): string {
  switch (delimiter) {
    case "tab":
      return "\t";
    case "semicolon":
      return ";";
    case "space":
      return " ";
    default:
      return ",";
  }
}

function csvCell(value: unknown, separator: string): string {
  const text = cellText(value);
  return text.includes('"') || text.includes(separator) || /[\r\n]/.test(text)
    ? '"' + text.replaceAll('"', '""') + '"'
    : text;
}

function tableName(context: ResultExportContext): string {
  if (!context.table || !context.dialect) {
    throw new Error("SQL export requires a single table and a SQL dialect");
  }
  return context.schema
    ? context.dialect.quoteIdentifier(context.schema) + "." + context.dialect.quoteIdentifier(context.table)
    : context.dialect.quoteIdentifier(context.table);
}

function sqlLiteral(dialect: Dialect, value: unknown): string {
  if (value == null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return dialect.escapeLiteral(cellText(value));
}

function serializeJson(context: ResultExportContext): string {
  return JSON.stringify(
    context.rows.map((row) => {
      const names = fieldNames(context.fields, context.rows);
      if (names.length === 0) return row;
      return Object.fromEntries(names.map((name, index) => [
        name,
        resultValueOrigin(rowValue(row, name, index)),
      ]));
    }),
    null,
    2,
  );
}

function serializeCsv(context: ResultExportContext, options: ResultExportOptions): string {
  const names = fieldNames(context.fields, context.rows);
  const separator = csvSeparator(options.csvDelimiter);
  return [
    names.map((name) => csvCell(name, separator)).join(separator),
    ...context.rows.map((row) => names
      .map((name, index) => csvCell(rowValue(row, name, index), separator))
      .join(separator)),
  ].join("\n") + "\n";
}

function serializeSql(context: ResultExportContext): string {
  const dialect = context.dialect;
  if (!dialect) throw new Error("SQL export requires a SQL dialect");
  const names = fieldNames(context.fields, context.rows);
  if (names.length === 0) return "";
  const target = tableName(context);
  const columns = names.map((name) => dialect.quoteIdentifier(name)).join(", ");
  return context.rows.map((row) => {
    const values = names
      .map((name, index) => sqlLiteral(dialect, rowValue(row, name, index)))
      .join(", ");
    return "INSERT INTO " + target + " (" + columns + ") VALUES (" + values + ");";
  }).join("\n") + (context.rows.length > 0 ? "\n" : "");
}

function serializeMarkdown(context: ResultExportContext): string {
  const names = fieldNames(context.fields, context.rows);
  const header = "| " + names.join(" | ") + " |";
  const separator = "| " + names.map((name) => "-".repeat(Math.max(3, name.length))).join(" | ") + " |";
  const rows = context.rows.map((row) => "| " + names
    .map((name, index) => cellText(rowValue(row, name, index), "null").replaceAll("|", "\\|").replaceAll("\n", " "))
    .join(" | ") + " |");
  const fence = String.fromCharCode(96).repeat(3);
  return "# SQL\n\n" + fence + "sql\n" + context.sql.trim() + "\n" + fence + "\n\n# Data\n\n"
    + [header, separator, ...rows].join("\n") + "\n";
}

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnReference(index: number): string {
  let value = index + 1;
  let reference = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    reference = String.fromCharCode(65 + remainder) + reference;
    value = Math.floor((value - 1) / 26);
  }
  return reference;
}

function xlsxCell(reference: string, value: unknown): string {
  if (value == null) return "<c r=\"" + reference + "\"/>";
  if (typeof value === "number" && Number.isFinite(value)) {
    return "<c r=\"" + reference + "\" t=\"n\"><v>" + String(value) + "</v></c>";
  }
  if (typeof value === "boolean") {
    return "<c r=\"" + reference + "\" t=\"b\"><v>" + (value ? "1" : "0") + "</v></c>";
  }
  return "<c r=\"" + reference + "\" t=\"inlineStr\"><is><t xml:space=\"preserve\">"
    + xmlText(cellText(value)) + "</t></is></c>";
}

function xlsxSheet(rows: readonly (readonly unknown[])[]): string {
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) =>
      xlsxCell(columnReference(columnIndex) + String(rowIndex + 1), value)).join("");
    return "<row r=\"" + String(rowIndex + 1) + "\">" + cells + "</row>";
  }).join("");
  const lastColumn = columnReference(Math.max(0, (rows[0]?.length || 1) - 1));
  const lastRow = Math.max(1, rows.length);
  return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    + "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"
    + "<dimension ref=\"A1:" + lastColumn + String(lastRow) + "\"/><sheetData>"
    + rowXml + "</sheetData></worksheet>";
}

function xlsxWorkbook(sheetNames: readonly string[]): string {
  const sheets = sheetNames.map((name, index) =>
    "<sheet name=\"" + xmlText(name) + "\" sheetId=\"" + String(index + 1)
    + "\" r:id=\"rId" + String(index + 1) + "\"/>").join("");
  return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    + "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" "
    + "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">"
    + "<sheets>" + sheets + "</sheets></workbook>";
}

function xlsxRelationships(sheetCount: number): string {
  const relationships = Array.from({ length: sheetCount }, (_, index) =>
    "<Relationship Id=\"rId" + String(index + 1)
    + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" "
    + "Target=\"worksheets/sheet" + String(index + 1) + ".xml\"/>").join("");
  return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
    + relationships + "</Relationships>";
}

function xlsxContentTypes(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, index) =>
    "<Override PartName=\"/xl/worksheets/sheet" + String(index + 1)
    + ".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>").join("");
  return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
    + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
    + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
    + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"
    + sheets + "</Types>";
}

function xlsxRootRelationships(): string {
  return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
    + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>"
    + "</Relationships>";
}

function serializeXlsx(context: ResultExportContext, options: ResultExportOptions): Buffer {
  const names = fieldNames(context.fields, context.rows);
  const resultRows = [
    names,
    ...context.rows.map((row) => names.map((name, index) => rowValue(row, name, index))),
  ];
  const sheets: (readonly (readonly unknown[])[])[] = [resultRows];
  const sheetNames = ["Result"];
  if (options.exportSQL) {
    sheets.push([["sql"], [context.sql.trim()]]);
    sheetNames.push("Query");
  }
  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(xlsxContentTypes(sheets.length), "utf8"));
  zip.addFile("_rels/.rels", Buffer.from(xlsxRootRelationships(), "utf8"));
  zip.addFile("xl/workbook.xml", Buffer.from(xlsxWorkbook(sheetNames), "utf8"));
  zip.addFile("xl/_rels/workbook.xml.rels", Buffer.from(xlsxRelationships(sheets.length), "utf8"));
  sheets.forEach((sheet, index) => {
    zip.addFile("xl/worksheets/sheet" + String(index + 1) + ".xml", Buffer.from(xlsxSheet(sheet), "utf8"));
  });
  return zip.toBuffer();
}

function encodeText(text: string, encoding: ResultCsvEncoding | undefined): Buffer {
  return encoding === "GBK" ? iconv.encode(text, "gbk") : Buffer.from(text, "utf8");
}

export function serializeResultExport(
  context: ResultExportContext,
  options: ResultExportOptions,
): ResultExportOutput {
  switch (options.type) {
    case "XLSX":
      return {
        format: options.type,
        extension: "xlsx",
        language: "xlsx",
        bytes: serializeXlsx(context, options),
      };
    case "CSV": {
      const text = serializeCsv(context, options);
      return {
        format: options.type,
        extension: "csv",
        language: "plaintext",
        text,
        bytes: encodeText(text, options.csvEncoding),
      };
    }
    case "SQL": {
      const text = serializeSql(context);
      return {
        format: options.type,
        extension: "sql",
        language: "sql",
        text,
        bytes: Buffer.from(text, "utf8"),
      };
    }
    case "Markdown": {
      const text = serializeMarkdown(context);
      return {
        format: options.type,
        extension: "md",
        language: "markdown",
        text,
        bytes: Buffer.from(text, "utf8"),
      };
    }
    case "JSON":
    default: {
      const text = serializeJson(context);
      return {
        format: "JSON",
        extension: "json",
        language: "json",
        text,
        bytes: Buffer.from(text, "utf8"),
      };
    }
  }
}
