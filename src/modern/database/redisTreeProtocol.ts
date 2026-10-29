export interface RedisDatabaseMeta {
  readonly name: string;
  readonly keys: number;
  readonly expires?: number;
  readonly avgTtl?: number;
}

export interface RedisScanPage {
  readonly cursor: string;
  readonly keys: string[];
}

export function parseRedisInfo(value: unknown): Map<string, string> {
  const source = typeof value === "string" ? value : String(value ?? "");
  const fields = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const name = line.slice(0, separator).trim();
    const fieldValue = line.slice(separator + 1).trim();
    if (name) fields.set(name, fieldValue);
  }
  return fields;
}

export function redisInfoValue(value: unknown, name: string): string | undefined {
  return parseRedisInfo(value).get(name);
}

export function parseRedisKeyspaceInfo(value: unknown): Map<string, RedisDatabaseMeta> {
  const source = typeof value === "string" ? value : String(value ?? "");
  const metadata = new Map<string, RedisDatabaseMeta>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.trim().match(/^db(\d+):(.+)$/i);
    if (!match) continue;
    const fields = Object.fromEntries(
      match[2].split(",").map((item) => {
        const separator = item.indexOf("=");
        return separator < 0
          ? [item.trim(), ""]
          : [item.slice(0, separator).trim(), item.slice(separator + 1).trim()];
      }),
    );
    const number = (key: string): number | undefined => {
      const parsed = Number(fields[key]);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    metadata.set(match[1], {
      name: match[1],
      keys: number("keys") ?? 0,
      expires: number("expires"),
      avgTtl: number("avg_ttl"),
    });
  }
  return metadata;
}

export function parseRedisScanPage(value: unknown): RedisScanPage {
  if (!Array.isArray(value)) return { cursor: "0", keys: [] };
  return {
    cursor: String(value[0] ?? "0"),
    keys: Array.isArray(value[1]) ? value[1].map(String).filter(Boolean) : [],
  };
}
