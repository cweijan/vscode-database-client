export interface ImageDataUrl {
  readonly mimeType: string;
  readonly bytes: Buffer;
  readonly extension: string;
}

function extensionForMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  if (normalized === "image/svg+xml") return "svg";
  return normalized.startsWith("image/") ? normalized.slice("image/".length) : "bin";
}

export function decodeImageDataUrl(value: unknown): ImageDataUrl | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
  if (!match) return undefined;
  try {
    const mimeType = match[1];
    return {
      mimeType,
      bytes: Buffer.from(match[2], "base64"),
      extension: extensionForMime(mimeType),
    };
  } catch {
    return undefined;
  }
}

export interface TinyPngKeyStatus {
  readonly configured: boolean;
  readonly apiKey: string;
}

export interface TinyPngCompressionResult {
  readonly dataUrl: string;
  readonly inputSize: number;
  readonly outputSize: number;
}

export class TinyPngService {
  public constructor(
    private readonly getApiKey: () => string,
    private readonly saveApiKey: (value: string) => Promise<void>,
  ) {}

  public getStatus(): TinyPngKeyStatus {
    const apiKey = this.getApiKey().trim();
    return { configured: Boolean(apiKey), apiKey };
  }

  public async setApiKey(value: unknown): Promise<TinyPngKeyStatus> {
    const apiKey = String(value || "").trim();
    await this.saveApiKey(apiKey);
    return { configured: Boolean(apiKey), apiKey };
  }

  public async compress(dataUrl: unknown): Promise<TinyPngCompressionResult> {
    const source = decodeImageDataUrl(dataUrl);
    if (!source) throw new Error("Invalid image data");
    const apiKey = this.getApiKey().trim();
    if (!apiKey) throw new Error("Please configure TinyPNG API key first");
    const authorization = `Basic ${Buffer.from(`api:${apiKey}`, "utf8").toString("base64")}`;
    const shrinkResponse = await fetch("https://api.tinify.com/shrink", {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/octet-stream",
      },
      body: source.bytes.buffer as ArrayBuffer,
    });
    if (shrinkResponse.status === 401) throw new Error("Invalid TinyPNG API key");
    if (shrinkResponse.status !== 201) {
      const payload = await shrinkResponse.json().catch(() => undefined) as unknown;
      const detail = payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message || "")
        : `Compress failed (${shrinkResponse.status})`;
      throw new Error(detail);
    }
    const location = shrinkResponse.headers.get("location");
    if (!location) throw new Error("Missing compressed image URL");
    const outputResponse = await fetch(location, {
      headers: { Authorization: authorization },
    });
    if (!outputResponse.ok) throw new Error("Failed to download compressed image");
    const output = Buffer.from(await outputResponse.arrayBuffer());
    return {
      dataUrl: `data:${source.mimeType};base64,${output.toString("base64")}`,
      inputSize: source.bytes.length,
      outputSize: output.length,
    };
  }
}
