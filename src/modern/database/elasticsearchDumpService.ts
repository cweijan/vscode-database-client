import { readFile, writeFile } from "node:fs/promises";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions, QueryResult } from "./types";
import {
  buildElasticsearchBulk,
  elasticDocumentSource,
  parseElasticsearchIndexRows,
  type ElasticsearchIndexMeta,
} from "./elasticsearchTreeProtocol";

export interface ElasticsearchDumpOptions {
  readonly withData?: boolean;
  readonly query?: Record<string, unknown>;
}

interface ElasticsearchDumpIndex {
  readonly name: string;
  readonly settings: Record<string, unknown>;
  readonly mappings: Record<string, unknown>;
  readonly aliases?: Record<string, unknown>;
  readonly data?: readonly Record<string, unknown>[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function responsePayload(result: QueryResult<Record<string, unknown>>): unknown {
  const normalized = record(result.raw);
  return normalized.raw ?? result.rows[0] ?? result.raw;
}

function indexDocument(
  result: QueryResult<Record<string, unknown>>,
  name: string,
): Record<string, unknown> {
  const payload = record(responsePayload(result));
  return record(payload[name] ?? payload);
}

function cleanSettings(value: unknown): Record<string, unknown> {
  const source = record(value);
  const settings = record(source.index);
  const result = { ...(Object.keys(settings).length > 0 ? settings : source) };
  for (const key of ["provided_name", "creation_date", "uuid", "version"]) {
    delete result[key];
  }
  return result;
}

function responseHits(result: QueryResult<Record<string, unknown>>): {
  readonly hits: readonly Record<string, unknown>[];
  readonly scrollId?: string;
} {
  const payload = record(responsePayload(result));
  const hits = record(payload.hits);
  const records = Array.isArray(hits.hits)
    ? hits.hits.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : result.rows;
  return {
    hits: records,
    scrollId: typeof payload._scroll_id === "string" ? payload._scroll_id : undefined,
  };
}

async function collectIndexData(
  services: ExtensionServices,
  connection: ConnectionOptions,
  index: string,
  query: Record<string, unknown> | undefined,
  token: vscode.CancellationToken,
): Promise<Record<string, unknown>[]> {
  const first = await services.connections.query<Record<string, unknown>>(
    connection,
    `GET /${encodeURIComponent(index)}/_search?scroll=1m\n${JSON.stringify({
      query: query || { match_all: {} },
      sort: ["_doc"],
      size: 1000,
    })}`,
  );
  const collected: Record<string, unknown>[] = [];
  let page = responseHits(first);
  try {
    while (page.hits.length > 0 && !token.isCancellationRequested) {
      collected.push(...page.hits.map(elasticDocumentSource));
      if (!page.scrollId) break;
      const next = await services.connections.query<Record<string, unknown>>(
        connection,
        `GET /_search/scroll\n${JSON.stringify({ scroll: "1m", scroll_id: page.scrollId })}`,
      );
      page = responseHits(next);
    }
  } finally {
    if (page.scrollId) {
      await services.connections.query(
        connection,
        `DELETE /_search/scroll\n${JSON.stringify({ scroll_id: page.scrollId })}`,
      ).catch(() => undefined);
    }
  }
  return collected;
}

async function resolveIndexes(
  services: ExtensionServices,
  connection: ConnectionOptions,
  scope: string | undefined,
): Promise<ElasticsearchIndexMeta[]> {
  if (scope) {
    return [{ name: scope, raw: { index: scope } }];
  }
  const result = await services.connections.query<Record<string, unknown>>(
    connection,
    "GET /_cat/indices?format=json",
  );
  return parseElasticsearchIndexRows(result.rows);
}

export async function dumpElasticsearch(
  services: ExtensionServices,
  connection: ConnectionOptions,
  scope?: string,
  options: ElasticsearchDumpOptions = {},
): Promise<boolean> {
  const file = await vscode.window.showSaveDialog({
    saveLabel: "Save Elasticsearch dump",
    filters: { JSON: ["json"] },
  });
  if (!file) return false;

  const indexes = await resolveIndexes(services, connection, scope);
  const dump: ElasticsearchDumpIndex[] = [];
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Dumping ${connection.name || connection.host || connection.id}…`,
      cancellable: true,
    },
    async (progress, token) => {
      for (const [indexNumber, meta] of indexes.entries()) {
        if (token.isCancellationRequested) return;
        const result = await services.connections.query<Record<string, unknown>>(
          connection,
          `GET /${encodeURIComponent(meta.name)}`,
        );
        const document = indexDocument(result, meta.name);
        const entry: ElasticsearchDumpIndex = {
          name: meta.name,
          ...document,
          settings: cleanSettings(document.settings),
          mappings: record(document.mappings),
          aliases: Object.keys(record(document.aliases)).length > 0
            ? record(document.aliases)
            : undefined,
        };
        if (options.withData) {
          (entry as { data?: readonly Record<string, unknown>[] }).data = await collectIndexData(
            services,
            connection,
            meta.name,
            options.query,
            token,
          );
        }
        dump.push(entry);
        progress.report({
          increment: indexes.length > 0 ? 100 / indexes.length : 100,
          message: `${indexNumber + 1}/${indexes.length} ${meta.name}`,
        });
      }
    },
  );
  await writeFile(file.fsPath, JSON.stringify(dump, null, 2), "utf8");
  void vscode.window.showInformationMessage(`Elasticsearch dump saved to ${file.fsPath}.`);
  return true;
}

function dumpEntries(value: unknown): ElasticsearchDumpIndex[] {
  if (!Array.isArray(value)) {
    throw new Error("Elasticsearch dump must contain a JSON array");
  }
  return value.map((item) => {
    const source = record(item);
    const name = typeof source.name === "string" ? source.name.trim() : "";
    if (!name) throw new Error("Elasticsearch dump index name is missing");
    return {
      name,
      settings: cleanSettings(source.settings),
      mappings: record(source.mappings),
      aliases: Object.keys(record(source.aliases)).length > 0 ? record(source.aliases) : undefined,
      data: Array.isArray(source.data)
        ? source.data.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
        : undefined,
    };
  });
}

export async function restoreElasticsearch(
  services: ExtensionServices,
  connection: ConnectionOptions,
): Promise<boolean> {
  const files = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Select Elasticsearch dump",
    filters: { JSON: ["json"] },
  });
  const file = files?.[0];
  if (!file) return false;
  const entries = dumpEntries(JSON.parse(await readFile(file.fsPath, "utf8")) as unknown);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Restoring ${connection.name || connection.host || connection.id}…`,
      cancellable: true,
    },
    async (progress, token) => {
      for (const [indexNumber, entry] of entries.entries()) {
        if (token.isCancellationRequested) return;
        const encodedName = encodeURIComponent(entry.name);
        let exists = true;
        try {
          await services.connections.query(connection, `HEAD /${encodedName}`);
        } catch {
          exists = false;
        }
        if (!exists) {
          const body: Record<string, unknown> = {
            settings: entry.settings,
            mappings: entry.mappings,
          };
          if (entry.aliases) body.aliases = entry.aliases;
          await services.connections.query(
            connection,
            `PUT /${encodedName}\n${JSON.stringify(body, null, 2)}`,
          );
        }
        if (entry.data && entry.data.length > 0) {
          for (let offset = 0; offset < entry.data.length; offset += 10_000) {
            if (token.isCancellationRequested) return;
            const bulk = buildElasticsearchBulk(entry.name, entry.data.slice(offset, offset + 10_000));
            if (bulk) await services.connections.query(connection, `POST /${encodedName}/_bulk\n${bulk}`);
          }
        }
        progress.report({
          increment: entries.length > 0 ? 100 / entries.length : 100,
          message: `${indexNumber + 1}/${entries.length} ${entry.name}`,
        });
      }
    },
  );
  void vscode.window.showInformationMessage(`Elasticsearch dump restored from ${file.fsPath}.`);
  return true;
}
