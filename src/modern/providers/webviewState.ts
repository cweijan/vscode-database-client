import type { ConnectionOptions } from "../database/types";
import { asConnectionOptions } from "../database/connectionOptions";

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function asConnection(value: unknown): ConnectionOptions | undefined {
  return asConnectionOptions(value);
}

export function connectionWithoutPassword(connection: ConnectionOptions): ConnectionOptions {
  const copy = { ...connection } as ConnectionOptions & { password?: string };
  delete copy.password;
  return copy;
}

function sanitizeConnectionState(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeConnectionState(item));
  const candidate = asConnection(value);
  if (candidate) return connectionWithoutPassword(candidate);
  if (!value || typeof value !== "object") return value;

  const source = record(value);
  const result: Record<string, unknown> = { ...source };
  for (const key of ["connection", "options", "target"]) {
    if (!(key in source)) continue;
    const nested = source[key];
    const nestedConnection = asConnection(nested);
    result[key] = nestedConnection
      ? connectionWithoutPassword(nestedConnection)
      : sanitizeConnectionState(nested);
  }
  return result;
}

export function sanitizeWebviewState(value: unknown): Record<string, unknown> {
  const source = record(value);
  const connection = asConnection(source.connection) || asConnection(source.options);
  const state: Record<string, unknown> = {
    ...source,
    ...(connection ? { connection: connectionWithoutPassword(connection) } : {}),
  };
  state.target = sanitizeConnectionState(source.target ?? state);
  return state;
}
