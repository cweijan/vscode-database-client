export interface RedisConsumerGroup {
  readonly name: string;
  readonly [key: string]: unknown;
}

export interface RedisItemMutationRequest {
  readonly keyName: string;
  readonly type: string;
  readonly old?: Record<string, unknown>;
  readonly key?: unknown;
  readonly value?: unknown;
  readonly score?: unknown;
  readonly index?: unknown;
  readonly position?: "head" | "tail";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pairRecord(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) return recordValue(value);
  const result: Record<string, unknown> = {};
  for (let index = 0; index + 1 < value.length; index += 2) {
    const name = String(value[index] ?? "").trim();
    if (name) result[name] = value[index + 1];
  }
  return result;
}

function nestedPairRecord(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value) || value.length === 0 || !value.every(
    (item) => Array.isArray(item) && item.length === 2,
  )) return undefined;
  return Object.fromEntries(value.map((item) => [String(item[0]), item[1]]));
}

export function normalizeRedisConsumerGroups(value: unknown): RedisConsumerGroup[] {
  const record = recordValue(value);
  const groups = Array.isArray(value)
    ? value
    : Array.isArray(record.groups) ? record.groups : [];
  const singleGroup = nestedPairRecord(groups);
  const candidates = singleGroup ? [singleGroup] : groups.map(pairRecord);
  return candidates
    .map((candidate) => {
      const name = String(candidate.name ?? candidate.group ?? "").trim();
      return name ? { ...candidate, name } : undefined;
    })
    .filter((group): group is RedisConsumerGroup => group !== undefined);
}

function redisText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function redisArgument(value: unknown): string {
  return JSON.stringify(redisText(value));
}

function oldValue(request: RedisItemMutationRequest, name: string): unknown {
  return request.old?.[name];
}

export function buildRedisItemCommands(request: RedisItemMutationRequest): string[] {
  const key = redisArgument(request.keyName);
  const value = redisText(request.value);
  switch (request.type.toLowerCase()) {
    case "hash": {
      const field = redisText(request.key).trim();
      if (!field) throw new Error("Redis hash field cannot be empty");
      const commands: string[] = [];
      const previous = redisText(oldValue(request, "key") ?? oldValue(request, "field")).trim();
      if (previous && previous !== field) commands.push(`HDEL ${key} ${redisArgument(previous)}`);
      commands.push(`HSET ${key} ${redisArgument(field)} ${redisArgument(value)}`);
      return commands;
    }
    case "list": {
      const index = Number(request.index ?? oldValue(request, "index"));
      if (Number.isInteger(index) && index >= 0) {
        return [`LSET ${key} ${index} ${redisArgument(value)}`];
      }
      return [`${request.position === "head" ? "LPUSH" : "RPUSH"} ${key} ${redisArgument(value)}`];
    }
    case "set": {
      const commands: string[] = [];
      const previous = oldValue(request, "value");
      if (previous !== undefined && redisText(previous) !== value) {
        commands.push(`SREM ${key} ${redisArgument(previous)}`);
      }
      commands.push(`SADD ${key} ${redisArgument(value)}`);
      return commands;
    }
    case "zset": {
      const commands: string[] = [];
      const previous = oldValue(request, "value");
      if (previous !== undefined && redisText(previous) !== value) {
        commands.push(`ZREM ${key} ${redisArgument(previous)}`);
      }
      const score = Number(request.score ?? oldValue(request, "score"));
      commands.push(`ZADD ${key} ${Number.isFinite(score) ? score : 0} ${redisArgument(value)}`);
      return commands;
    }
    default:
      throw new Error(`Redis item editing is not supported for type ${request.type}`);
  }
}
