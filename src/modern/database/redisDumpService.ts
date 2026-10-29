import { readFile, writeFile } from "node:fs/promises";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions, QueryResult } from "./types";

interface RedisDumpRecord {
  readonly key: string;
  readonly value: string;
  readonly ttl: number;
}

interface RedisScanPage {
  readonly cursor: string;
  readonly keys: string[];
}

function rows(result: QueryResult<Record<string, unknown>>): Record<string, unknown>[] {
  return Array.isArray(result.rows) ? result.rows : [];
}

function valueOf(result: QueryResult<Record<string, unknown>>): unknown {
  const row = rows(result)[0] || {};
  if (row.value !== undefined) return row.value;
  const matching = Object.keys(row).find((key) => key.toLocaleLowerCase() === "value");
  return matching ? row[matching] : undefined;
}

function scanPage(result: QueryResult<Record<string, unknown>>): RedisScanPage {
  const value = valueOf(result);
  if (!Array.isArray(value)) return { cursor: "0", keys: [] };
  return {
    cursor: String(value[0] ?? "0"),
    keys: Array.isArray(value[1]) ? value[1].map(String).filter(Boolean) : [],
  };
}

function dumpHex(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString("hex");
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (typeof value === "string") return Buffer.from(value, "latin1").toString("hex");
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.type === "Buffer" && Array.isArray(record.data)) {
      return Buffer.from(record.data.filter((item): item is number => typeof item === "number")).toString("hex");
    }
  }
  return "";
}

function parseDumpRecords(source: string): RedisDumpRecord[] {
  const trimmed = source.trim();
  if (!trimmed) return [];
  const candidates: unknown[] = trimmed.startsWith("[")
    ? (() => {
      const parsed: unknown = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    })()
    : trimmed.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("//"))
      .map((line) => JSON.parse(line));
  return candidates.flatMap((candidate): RedisDumpRecord[] => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key : "";
    const value = typeof record.value === "string" ? record.value : "";
    const ttl = Number(record.ttl);
    return key && /^[0-9a-f]+$/i.test(value) && Number.isFinite(ttl)
      ? [{ key, value, ttl }]
      : [];
  });
}

async function collectDumpRecords(
  services: ExtensionServices,
  connection: ConnectionOptions,
  prefix?: string,
): Promise<RedisDumpRecord[]> {
  const records: RedisDumpRecord[] = [];
  const seen = new Set<string>();
  let cursor = "0";
  do {
    const match = prefix ? ` MATCH ${JSON.stringify(`${prefix}:*`)}` : "";
    const page = scanPage(await services.connections.query<Record<string, unknown>>(
      connection,
      `SCAN ${JSON.stringify(cursor)}${match} COUNT 1000`,
    ));
    cursor = page.cursor;
    for (const key of page.keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      const dump = dumpHex(valueOf(await services.connections.query(
        connection,
        `DUMP ${JSON.stringify(key)}`,
      )));
      if (!dump) continue;
      const ttlValue = valueOf(await services.connections.query(
        connection,
        `TTL ${JSON.stringify(key)}`,
      ));
      const ttl = Number(ttlValue);
      records.push({ key, value: dump, ttl: Number.isFinite(ttl) ? ttl : -1 });
    }
  } while (cursor !== "0");
  return records;
}

export async function dumpRedis(
  services: ExtensionServices,
  connection: ConnectionOptions,
  prefix?: string,
): Promise<void> {
  const file = await vscode.window.showSaveDialog({
    saveLabel: "Export Redis dump",
    filters: { "Redis dump": ["json", "jsonl"] },
    defaultUri: vscode.Uri.file("redis-dump.json"),
  });
  if (!file) return;
  const records = await collectDumpRecords(services, connection, prefix);
  await writeFile(file.fsPath, JSON.stringify(records, null, 2), "utf8");
  void vscode.window.showInformationMessage(`Exported ${records.length} Redis keys.`);
}

export async function restoreRedis(
  services: ExtensionServices,
  connection: ConnectionOptions,
): Promise<void> {
  const files = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Import Redis dump",
    filters: { "Redis dump": ["json", "jsonl"] },
  });
  const file = files?.[0];
  if (!file) return;
  const records = parseDumpRecords(await readFile(file.fsPath, "utf8"));
  for (const record of records) {
    const ttl = Math.max(0, Math.trunc(record.ttl));
    const encoded = `__DBCLIENT_HEX__${record.value}`;
    await services.connections.query(
      connection,
      `RESTORE ${JSON.stringify(record.key)} ${ttl} ${JSON.stringify(encoded)} REPLACE`,
    );
  }
  void vscode.window.showInformationMessage(`Imported ${records.length} Redis keys.`);
}
