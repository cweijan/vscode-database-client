export interface MockFieldModel {
  readonly type: string;
  readonly value: string;
  readonly nullable?: boolean;
}

export interface MockModel {
  readonly table: string;
  readonly mockCount: number;
  readonly mockStartIndex: number | "auto";
  readonly mockValueReference?: string;
  readonly mock: Record<string, MockFieldModel>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function integerInRange(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof value === "number" || typeof value === "string"
    ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function normalizeField(value: unknown): MockFieldModel {
  const field = record(value);
  return {
    type: text(field.type) || "varchar",
    value: text(field.value),
    ...(typeof field.nullable === "boolean" ? { nullable: field.nullable } : {}),
  };
}

/**
 * Validate the JSON-shaped model exchanged by the Mock Webview.
 * Invalid fields are normalized at the protocol boundary so host handlers
 * never need to trust a browser payload through a type assertion.
 */
export function normalizeMockModel(value: unknown): MockModel | undefined {
  const candidate = record(value);
  const table = text(candidate.table).trim();
  if (!table) return undefined;

  const mock = Object.fromEntries(
    Object.entries(record(candidate.mock))
      .filter(([name]) => name.trim().length > 0)
      .map(([name, field]) => [name, normalizeField(field)]),
  );
  const startValue = candidate.mockStartIndex;
  const mockStartIndex = startValue === "auto"
    ? "auto"
    : integerInRange(startValue, 1, 0, Number.MAX_SAFE_INTEGER);

  return {
    table,
    mockCount: integerInRange(candidate.mockCount, 10, 1, 10_000),
    mockStartIndex,
    ...(typeof candidate.mockValueReference === "string"
      ? { mockValueReference: candidate.mockValueReference }
      : {}),
    mock,
  };
}
