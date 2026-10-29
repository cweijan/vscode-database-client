import type { ConnectionOptions } from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Reads a connection setting from both the target's top-level shape and the
 * modern nested `options` shape.  The installed extension stores most
 * connection settings at the top level, while the modern source keeps
 * driver-specific values under `options` so both forms must remain readable.
 */
export function connectionOption(
  options: ConnectionOptions,
  key: string,
): unknown {
  const source = record(options);
  const direct = source[key];
  if (direct !== undefined) return direct;

  const configured = record(source.options)[key];
  if (configured !== undefined) return configured;

  const advance = record(source.advance ?? record(source.options).advance);
  if (key === "timezone") {
    return source.timeZone ?? advance.timezone ?? advance.timeZone;
  }
  if (key === "sqlMode" || key === "timeZone" || key === "includeDatabases") {
    return advance[key];
  }
  return undefined;
}

export function connectionNamespace(
  options: ConnectionOptions,
  namespace: string,
): Record<string, unknown> {
  const source = record(options);
  const direct = record(source[namespace]);
  if (Object.keys(direct).length > 0) return direct;
  return record(record(source.options)[namespace]);
}

export function sshConnectionNamespace(options: ConnectionOptions): Record<string, unknown> {
  const source = record(options);
  const directSsh = record(source.ssh);
  const direct = Object.keys(directSsh).length > 0
    ? directSsh
    : record(source.sshConnect);
  if (Object.keys(direct).length > 0) return direct;
  const configured = record(source.options);
  const configuredSsh = record(configured.ssh);
  return Object.keys(configuredSsh).length > 0
    ? configuredSsh
    : record(configured.sshConnect);
}

/**
 * Accept both the modern `type` field and the installed target's `dbType`
 * field without mutating the persisted configuration.
 */
export function asConnectionOptions(
  value: unknown,
  idHint?: string,
): ConnectionOptions | undefined {
  const source = record(value);
  const id = text(source.id) || text(idHint);
  const rawType = text(source.type) || text(source.dbType);
  if (!id || !rawType) return undefined;
  const type = rawType === "KingBase" ? "Kingbase" : rawType;
  return { ...source, id, type } as ConnectionOptions;
}
