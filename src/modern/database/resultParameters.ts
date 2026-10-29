export interface HexResultParameter {
  readonly type?: unknown;
  readonly value?: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeResultParameter(value: unknown): unknown {
  const parameter = record(value);
  if (String(parameter.type || "").toUpperCase() !== "HEX") return value;
  const raw = typeof parameter.value === "string" ? parameter.value.trim() : "";
  const hex = raw.replace(/^0x/i, "");
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error("HEX result parameters must contain an even hexadecimal value");
  }
  return Buffer.from(hex, "hex");
}

export function normalizeResultParameters(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(normalizeResultParameter);
}

export function normalizeResultParameterLists(
  value: unknown,
): readonly (readonly unknown[])[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => normalizeResultParameters(item) || []);
}
