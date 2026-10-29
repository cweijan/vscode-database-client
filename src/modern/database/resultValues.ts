export interface ResultBinaryValue {
  readonly kind: "binary";
  readonly base64: string;
}

export interface ResultLongStringValue {
  readonly type: "LongString";
  readonly origin: unknown;
  readonly data?: string;
}

export interface ResultBinaryPreviewValue {
  readonly type: "Binary" | "Image";
  readonly origin: string;
  readonly data: string;
}

export const RESULT_LONG_STRING_LIMIT = 65_535;
export const RESULT_LONG_STRING_PREVIEW_LIMIT = 1_024;

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validBase64(value: string): boolean {
  return /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length % 4 !== 1;
}

function longStringValue(value: unknown): ResultLongStringValue | undefined {
  const record = recordValue(value);
  return record.type === "LongString" && "origin" in record
    ? {
      type: "LongString",
      origin: record.origin,
      data: typeof record.data === "string" ? record.data : undefined,
    }
    : undefined;
}

function binaryPreviewValue(value: unknown): ResultBinaryPreviewValue | undefined {
  const record = recordValue(value);
  return (record.type === "Binary" || record.type === "Image")
    && typeof record.origin === "string"
    && typeof record.data === "string"
    ? {
      type: record.type,
      origin: record.origin,
      data: record.data,
    }
    : undefined;
}

function hexToBytes(value: string): readonly number[] | undefined {
  const normalized = value.trim().replace(/^0x/i, "");
  if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) {
    return undefined;
  }
  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 2) {
    bytes.push(Number.parseInt(normalized.slice(index, index + 2), 16));
  }
  return bytes;
}

function byteValues(value: unknown): readonly number[] | undefined {
  const record = recordValue(value);
  if (record.type === "Buffer" && Array.isArray(record.data)) {
    const values = record.data.map(Number);
    return values.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
      ? values
      : undefined;
  }
  const preview = binaryPreviewValue(value);
  if (preview) return hexToBytes(preview.origin);
  if (value instanceof Uint8Array) return [...value];
  return undefined;
}

function bytesToBase64(bytes: readonly number[]): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += alphabet[first >> 2];
    result += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    result += second === undefined ? "=" : alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    result += third === undefined ? "=" : alphabet[third & 63];
  }
  return result;
}

function bytesToHex(bytes: readonly number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(value: string): readonly number[] | undefined {
  const normalized = value.trim();
  if (!validBase64(normalized)) return undefined;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 4) {
    const first = alphabet.indexOf(normalized[index] || "");
    const second = alphabet.indexOf(normalized[index + 1] || "");
    const third = normalized[index + 2] === "="
      ? 0
      : alphabet.indexOf(normalized[index + 2] || "");
    const fourth = normalized[index + 3] === "="
      ? 0
      : alphabet.indexOf(normalized[index + 3] || "");
    if ([first, second, third, fourth].some((item) => item < 0)) return undefined;
    bytes.push((first << 2) | (second >> 4));
    if (normalized[index + 2] !== "=") bytes.push(((second & 15) << 4) | (third >> 2));
    if (normalized[index + 3] !== "=") bytes.push(((third & 3) << 6) | fourth);
  }
  return bytes;
}

function binaryText(bytes: readonly number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

function imageDetails(bytes: readonly number[]): { label: string; width?: number; height?: number } | undefined {
  if (bytes.length >= 24
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    const width = bytes[16] * 0x1000000 + bytes[17] * 0x10000 + bytes[18] * 0x100 + bytes[19];
    const height = bytes[20] * 0x1000000 + bytes[21] * 0x10000 + bytes[22] * 0x100 + bytes[23];
    return { label: "PNG", width, height };
  }
  if (bytes.length >= 10
    && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46
    && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return {
      label: "GIF",
      width: bytes[6] | (bytes[7] << 8),
      height: bytes[8] | (bytes[9] << 8),
    };
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { label: "WEBP" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { label: "JPEG" };
  }
  return undefined;
}

function byteSize(bytes: readonly number[]): string {
  if (bytes.length < 1024) return `${bytes.length} bytes`;
  if (bytes.length < 1024 * 1024) return `${(bytes.length / 1024).toFixed(1)} KiB`;
  return `${(bytes.length / (1024 * 1024)).toFixed(1)} MiB`;
}

function isTextField(fieldType: string): boolean {
  return /json|text|char|clob|xml|uuid|varchar|nvarchar|nchar/i.test(fieldType);
}

function isBinaryField(fieldType: string): boolean {
  return /blob|bytea|raw|binary|varbinary|image|lob/i.test(fieldType);
}

function formatBinaryValue(bytes: readonly number[], fieldType: string): ResultBinaryPreviewValue {
  const image = imageDetails(bytes);
  const label = image
    ? `${image.label}${image.width && image.height ? `: ${image.width}x${image.height}` : ""}`
    : fieldType.trim().toUpperCase() || "BINARY";
  return {
    type: image ? "Image" : "Binary",
    origin: `0x${bytesToHex(bytes).toUpperCase()}`,
    data: `[${label}] ${byteSize(bytes)}`,
  };
}

export function formatResultValue(value: unknown, fieldType = ""): unknown {
  if (value == null) return value;
  const longString = longStringValue(value);
  if (longString) return value;
  if (binaryPreviewValue(value)) return value;
  if (typeof value === "string") {
    if (value.length <= RESULT_LONG_STRING_LIMIT) return value;
    const preview = value.slice(0, RESULT_LONG_STRING_PREVIEW_LIMIT);
    return {
      type: "LongString",
      origin: value,
      data: `[${preview.length} of ${value.length}] ${preview}`,
    } satisfies ResultLongStringValue;
  }
  if (Array.isArray(value)) return value.map((item) => formatResultValue(item, fieldType));
  const bytes = byteValues(value);
  if (bytes !== undefined) {
    const decoded = binaryText(bytes);
    if (!isBinaryField(fieldType) && (isTextField(fieldType) || !decoded.includes("\uFFFD"))) {
      return formatResultValue(decoded, fieldType);
    }
    return formatBinaryValue(bytes, fieldType);
  }
  return value;
}

export function resultBinaryBase64(value: unknown): string | undefined {
  const record = recordValue(value);
  if (record.kind === "binary" && typeof record.base64 === "string") {
    return record.base64.trim();
  }
  const preview = binaryPreviewValue(value);
  if (preview) {
    const bytes = hexToBytes(preview.origin);
    return bytes === undefined ? undefined : bytesToBase64(bytes);
  }
  const bytes = byteValues(value);
  return bytes === undefined ? undefined : bytesToBase64(bytes);
}

export function resultBinaryHex(value: unknown): string | undefined {
  const preview = binaryPreviewValue(value);
  if (preview) {
    const bytes = hexToBytes(preview.origin);
    return bytes === undefined ? undefined : bytesToHex(bytes);
  }
  const base64 = resultBinaryBase64(value);
  const bytes = base64 === undefined ? undefined : base64ToBytes(base64);
  return bytes === undefined ? undefined : bytesToHex(bytes);
}

export function resultBinaryFromHex(value: string): ResultBinaryValue | undefined {
  const bytes = hexToBytes(value);
  return bytes === undefined ? undefined : { kind: "binary", base64: bytesToBase64(bytes) };
}

export function resultIsBinaryValue(value: unknown): boolean {
  return resultBinaryBase64(value) !== undefined;
}

export function resultValueOrigin(value: unknown): unknown {
  const longString = longStringValue(value);
  return longString === undefined ? value : longString.origin;
}

export function resultValueText(value: unknown, nullText = ""): string {
  if (value == null) return nullText;
  const longString = longStringValue(value);
  if (longString) {
    return typeof longString.data === "string"
      ? longString.data
      : resultValueText(longString.origin, nullText);
  }
  const binaryPreview = binaryPreviewValue(value);
  if (binaryPreview) return binaryPreview.data;
  const normalized = resultValueOrigin(value);
  if (normalized !== value) return resultValueText(normalized, nullText);
  const binary = resultBinaryBase64(value);
  if (binary !== undefined) {
    const bytes = byteValues(value);
    return bytes === undefined
      ? `[binary ${binary.length} base64 chars]`
      : `[binary ${bytes.length} bytes]`;
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function resultValueExportText(value: unknown, nullText = ""): string {
  const longString = longStringValue(value);
  if (longString) return resultValueText(longString.origin, nullText);
  return resultValueText(value, nullText);
}

export function resultValueEditText(value: unknown): string {
  if (value == null) return "";
  const binary = resultBinaryBase64(value);
  if (binary !== undefined) return `base64:${binary}`;
  const normalized = resultValueOrigin(value);
  if (normalized !== value) return resultValueEditText(normalized);
  return resultValueText(value);
}

export function parseResultBinaryInput(value: string): ResultBinaryValue | null {
  const normalized = value.trim();
  if (normalized.toUpperCase() === "NULL") return null;
  const match = normalized.match(/^base64:(.*)$/is);
  if (!match || !validBase64(match[1].trim())) {
    throw new Error("Binary values must use valid base64 with the base64: prefix");
  }
  return { kind: "binary", base64: match[1].trim() };
}
