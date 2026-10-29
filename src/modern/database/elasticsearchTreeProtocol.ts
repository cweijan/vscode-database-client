export interface ElasticsearchIndexMeta {
  readonly name: string;
  readonly health?: string;
  readonly status?: string;
  readonly uuid?: string;
  readonly primaryShards?: number;
  readonly replicaShards?: number;
  readonly docsCount?: number;
  readonly docsDeleted?: number;
  readonly storeSize?: string;
  readonly primaryStoreSize?: string;
  readonly raw: Record<string, unknown>;
}

export interface ElasticsearchFieldMeta {
  readonly name: string;
  readonly type: string;
  readonly children: readonly ElasticsearchFieldMeta[];
  readonly raw: Record<string, unknown>;
}

export interface ElasticsearchDataStreamMeta {
  readonly name: string;
  readonly status?: string;
  readonly timestampField?: string;
  readonly indices: readonly string[];
  readonly raw: Record<string, unknown>;
}

const ELASTICSEARCH_SIZE_UNITS: Readonly<Record<string, number>> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
  pb: 1024 ** 5,
};

/**
 * Converts the human-readable value returned by Elasticsearch's _cat API
 * into bytes.  The protocol accepts both the short `1.2gb` form used by
 * `_cat/indices` and numeric values returned by test doubles or proxies.
 */
export function parseElasticsearchSize(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase();
  if (!normalized || normalized === "-" || normalized === "n/a") return undefined;
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb|pb)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const multiplier = ELASTICSEARCH_SIZE_UNITS[match[2]];
  const bytes = amount * multiplier;
  return Number.isFinite(bytes) ? bytes : undefined;
}

export function sumElasticsearchStoreBytes(indexes: readonly ElasticsearchIndexMeta[]): number | undefined {
  let total = 0;
  let found = false;
  for (const index of indexes) {
    const bytes = parseElasticsearchSize(index.storeSize);
    if (bytes === undefined) continue;
    total += bytes;
    found = true;
  }
  return found ? total : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const result = String(value).trim();
  return result ? result : undefined;
}

function number(value: unknown): number | undefined {
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function firstText(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = text(source[key]);
    if (value) return value;
  }
  return undefined;
}

function firstNumber(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = number(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function inputRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const source = record(value);
  if (Array.isArray(source.rows)) return source.rows;
  if (source.value !== undefined && typeof source.value === "string") {
    return [source.value];
  }
  return source.index || source.name ? [source] : [];
}

function parseCatLine(line: string): ElasticsearchIndexMeta | undefined {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3 || parts[0].toLocaleLowerCase() === "health") return undefined;
  const [health, status, name, uuid, primaryShards, replicaShards, docsCount, docsDeleted, storeSize, primaryStoreSize] = parts;
  if (!name) return undefined;
  return {
    name,
    health,
    status,
    uuid,
    primaryShards: number(primaryShards),
    replicaShards: number(replicaShards),
    docsCount: number(docsCount),
    docsDeleted: number(docsDeleted),
    storeSize,
    primaryStoreSize,
    raw: { health, status, index: name, uuid, pri: primaryShards, rep: replicaShards, docsCount, docsDeleted, "store.size": storeSize, "pri.store.size": primaryStoreSize },
  };
}

function parseIndexRow(value: unknown): ElasticsearchIndexMeta | undefined {
  if (typeof value === "string") return parseCatLine(value);
  const source = record(value);
  const name = firstText(source, "index", "name", "label");
  if (!name) return undefined;
  return {
    name,
    health: firstText(source, "health"),
    status: firstText(source, "status"),
    uuid: firstText(source, "uuid"),
    primaryShards: firstNumber(source, "pri", "primary", "primaryShards"),
    replicaShards: firstNumber(source, "rep", "replicas", "replicaShards"),
    docsCount: firstNumber(source, "docs.count", "docsCount", "docs"),
    docsDeleted: firstNumber(source, "docs.deleted", "docsDeleted"),
    storeSize: firstText(source, "store.size", "storeSize", "store"),
    primaryStoreSize: firstText(source, "pri.store.size", "primaryStoreSize"),
    raw: source,
  };
}

export function parseElasticsearchIndexRows(value: unknown): ElasticsearchIndexMeta[] {
  const rows = inputRows(value);
  const parsed = rows.flatMap((row) => {
    if (typeof row !== "string") {
      const source = record(row);
      if (typeof source.value === "string") {
        return source.value
          .split(/\r?\n/)
          .map((line) => parseCatLine(line))
          .filter((item): item is ElasticsearchIndexMeta => item !== undefined);
      }
      const parsedRow = parseIndexRow(row);
      return parsedRow ? [parsedRow] : [];
    }
    return row
      .split(/\r?\n/)
      .map((line) => parseCatLine(line))
      .filter((item): item is ElasticsearchIndexMeta => item !== undefined);
  });
  const unique = new Map(parsed.map((item) => [item.name, item]));
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function fieldChildren(source: Record<string, unknown>): ElasticsearchFieldMeta[] {
  const properties = record(source.properties);
  const fields = record(source.fields);
  const names = [...new Set([...Object.keys(properties), ...Object.keys(fields)])];
  return names.map((name) => {
    const property = record(properties[name] ?? fields[name]);
    return {
      name,
      type: firstText(property, "type") || (Object.keys(record(property.properties)).length > 0 ? "object" : "unknown"),
      children: fieldChildren(property),
      raw: property,
    };
  });
}

function mappingRoot(value: unknown, indexName?: string): Record<string, unknown> {
  const response = record(value);
  const index = indexName ? record(response[indexName]) : response;
  const mappings = record(index.mappings || index);
  if (Object.keys(record(mappings.properties)).length > 0) return mappings;
  for (const candidate of Object.values(mappings)) {
    const nested = record(candidate);
    if (Object.keys(record(nested.properties)).length > 0) return nested;
  }
  return mappings;
}

export function parseElasticsearchMapping(
  value: unknown,
  indexName?: string,
): ElasticsearchFieldMeta[] {
  return fieldChildren(mappingRoot(value, indexName));
}

export function parseElasticsearchDataStreams(value: unknown): ElasticsearchDataStreamMeta[] {
  const response = record(value);
  const streams = Array.isArray(response.data_streams) ? response.data_streams : [];
  const parsed: Array<ElasticsearchDataStreamMeta | undefined> = streams.map((item): ElasticsearchDataStreamMeta | undefined => {
      const source = record(item);
      const indices = Array.isArray(source.indices)
        ? source.indices.map((index) => firstText(record(index), "index_name", "name")).filter((name): name is string => Boolean(name))
        : [];
      const name = firstText(source, "name");
      return name
        ? {
          name,
          status: firstText(source, "status"),
          timestampField: firstText(record(source.timestamp_field), "name") || firstText(source, "timestamp_field"),
          indices,
          raw: source,
        }
        : undefined;
    });
  return parsed
    .filter((item): item is ElasticsearchDataStreamMeta => item !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function parseElasticsearchVersion(value: unknown): string | undefined {
  const response = record(value);
  const version = record(response.version);
  return firstText(version, "number");
}

export function elasticDocumentSource(row: Record<string, unknown>): Record<string, unknown> {
  const source = record(row._source);
  if (Object.keys(source).length > 0) return { ...source };
  const result = { ...row };
  delete result._score;
  delete result._id;
  delete result._index;
  delete result._type;
  return result;
}

export function buildElasticsearchBulk(index: string, rows: readonly Record<string, unknown>[]): string {
  const lines: string[] = [];
  for (const row of rows) {
    lines.push(JSON.stringify({ create: { _index: index } }));
    lines.push(JSON.stringify(elasticDocumentSource(row)));
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
