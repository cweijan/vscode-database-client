import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import { readFile } from "node:fs/promises";

import type { ResultCsvDelimiter, ResultCsvEncoding } from "./resultExport";

export interface ResultImportParseOptions {
  readonly csvEncoding?: ResultCsvEncoding;
  readonly csvDelimiter?: ResultCsvDelimiter;
}

export type ResultImportFormat = "JSON" | "CSV" | "XLSX" | "PARQUET";

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

function csvValue(value: string): unknown {
  if (value === "") return "";
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())
    ? numeric
    : value;
}

function parseDelimited(source: string, separator: string): Record<string, unknown>[] {
  const records: string[][] = [];
  let current: string[] = [];
  let field = "";
  let quoted = false;
  const flush = (): void => {
    if (current.length > 0 || field.length > 0) {
      current.push(field);
      if (current.some((value) => value.length > 0)) records.push(current);
    }
    current = [];
    field = "";
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === separator && !quoted) {
      current.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      flush();
    } else {
      field += character;
    }
  }
  flush();

  const headers = records.shift() ?? [];
  return records.map((values) => Object.fromEntries(
    headers.map((header, index) => [header.trim(), csvValue(values[index] ?? "")]),
  ));
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function xmlAttribute(attributes: string, name: string): string | undefined {
  return attributes.match(new RegExp("\\b" + name + "=\"([^\"]*)\""))?.[1];
}

function columnIndex(reference: string | undefined, fallback: number): number {
  const letters = reference?.match(/^[A-Za-z]+/)?.[0];
  if (!letters) return fallback;
  return [...letters.toUpperCase()].reduce((result, letter) =>
    result * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((text) => decodeXml(text[1]))
      .join(""));
}

function worksheetRows(xml: string, strings: readonly string[]): unknown[][] {
  return [...xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const rowValues: unknown[] = [];
    let fallback = 0;
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2] || "";
      const index = columnIndex(xmlAttribute(attributes, "r"), fallback);
      fallback = index + 1;
      const type = xmlAttribute(attributes, "t");
      const inline = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1];
      const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      if (type === "inlineStr") {
        rowValues[index] = decodeXml(inline || "");
      } else if (type === "s") {
        rowValues[index] = strings[Number(raw)] ?? "";
      } else if (type === "b") {
        rowValues[index] = raw === "1";
      } else if (raw == null || raw === "") {
        rowValues[index] = "";
      } else {
        const numeric = Number(raw);
        rowValues[index] = Number.isFinite(numeric) ? numeric : decodeXml(raw);
      }
    }
    return rowValues;
  });
}

function parseXlsx(source: Buffer): Record<string, unknown>[] {
  const zip = new AdmZip(source);
  const worksheet = zip.getEntry("xl/worksheets/sheet1.xml");
  if (!worksheet) throw new Error("The XLSX file contains no first worksheet");
  const strings = sharedStrings(
    zip.getEntry("xl/sharedStrings.xml")
      ? zip.readAsText("xl/sharedStrings.xml")
      : undefined,
  );
  const rows = worksheetRows(zip.readAsText(worksheet), strings);
  const headers = (rows.shift() || []).map((value, index) =>
    String(value ?? "column_" + String(index + 1)).trim() || "column_" + String(index + 1));
  return rows.map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""]),
  ));
}

function parseJson(source: string): Record<string, unknown>[] {
  const value = JSON.parse(source) as unknown;
  const rows = Array.isArray(value) ? value : recordValue(value).rows;
  return Array.isArray(rows)
    ? rows.map(recordValue).filter((row) => Object.keys(row).length > 0)
    : [];
}

async function parseParquet(path: string): Promise<Record<string, unknown>[]> {
  const { asyncBufferFromFile, parquetReadObjects } = await import("hyparquet/src/node.js");
  const file = await asyncBufferFromFile(path);
  const rows: readonly unknown[] = await parquetReadObjects({
    file,
    rowFormat: "object",
  });
  return rows
    .map(recordValue)
    .filter((row) => Object.keys(row).length > 0);
}

export function parseResultImportRows(
  source: Buffer | string,
  format: Exclude<ResultImportFormat, "PARQUET">,
  options: ResultImportParseOptions = {},
): Record<string, unknown>[] {
  if (format === "XLSX") {
    if (!Buffer.isBuffer(source)) throw new Error("XLSX import requires binary file content");
    return parseXlsx(source);
  }
  const text = Buffer.isBuffer(source)
    ? (options.csvEncoding === "GBK" ? iconv.decode(source, "gbk") : source.toString("utf8"))
    : source;
  return format === "JSON"
    ? parseJson(text)
    : parseDelimited(text, csvSeparator(options.csvDelimiter));
}

export async function parseResultImportFile(
  path: string,
  format: ResultImportFormat,
  options: ResultImportParseOptions = {},
): Promise<Record<string, unknown>[]> {
  if (format === "PARQUET") return parseParquet(path);
  return parseResultImportRows(await readFile(path), format, options);
}

export function importFormatFromPath(path: string): ResultImportFormat | "SQL" {
  const lower = path.toLowerCase();
  if (lower.endsWith(".xlsx")) return "XLSX";
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".parquet")) return "PARQUET";
  if (lower.endsWith(".sql")) return "SQL";
  return "JSON";
}
