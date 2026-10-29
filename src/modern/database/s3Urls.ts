import type { ConnectionOptions } from "./types";

export interface S3ResourcePath {
  readonly bucket: string;
  readonly key: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function s3Options(connection: ConnectionOptions): Record<string, unknown> {
  return record(connection.options?.s3) || {};
}

function optionBoolean(
  connection: ConnectionOptions,
  options: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = options[key] ?? connection.options?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function optionNumber(
  connection: ConnectionOptions,
  options: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = options[key] ?? connection.options?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function splitS3ResourcePath(source: string): S3ResourcePath {
  const clean = source.replace(/^\/+/, "");
  const separator = clean.indexOf("/");
  return separator < 0
    ? { bucket: clean, key: "" }
    : { bucket: clean.slice(0, separator), key: clean.slice(separator + 1) };
}

function s3Endpoint(connection: ConnectionOptions): URL {
  const options = s3Options(connection);
  const configured = connection.connectionUrl?.trim();
  if (configured) return new URL(configured);

  const useSSL = optionBoolean(connection, options, "useSSL", true);
  const host = connection.host || "s3.amazonaws.com";
  const port = connection.port || optionNumber(connection, options, "port", useSSL ? 443 : 80);
  const protocol = useSSL ? "https:" : "http:";
  const normalizedHost = /^https?:\/\//i.test(host) ? host : `${protocol}//${host}`;
  const endpoint = new URL(normalizedHost);
  if (!endpoint.port && port !== 443 && port !== 80) endpoint.port = String(port);
  return endpoint;
}

function encodeS3Key(key: string): string {
  return key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export function s3PublicUrl(
  connection: ConnectionOptions,
  resourcePath: string,
): string {
  const { bucket, key } = splitS3ResourcePath(resourcePath);
  if (!bucket || !key) throw new Error("An S3 object path must include a bucket and object key");

  const options = s3Options(connection);
  const url = s3Endpoint(connection);
  const basePath = url.pathname.replace(/\/+$/, "");
  const encodedKey = encodeS3Key(key);
  if (optionBoolean(connection, options, "pathStyle", false)) {
    url.pathname = `${basePath}/${encodeURIComponent(bucket)}/${encodedKey}`;
  } else {
    url.hostname = `${bucket}.${url.hostname}`;
    url.pathname = `${basePath}/${encodedKey}`;
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function serviceIds(connection: ConnectionOptions): string[] {
  const options = s3Options(connection);
  const configured = options.serviceIds ?? connection.options?.serviceIds;
  if (Array.isArray(configured)) return configured.map(String).filter(Boolean);
  if (typeof configured === "string") {
    return configured.split(",").map((value) => value.trim()).filter(Boolean);
  }
  return [];
}

export function s3WebsiteUrl(connection: ConnectionOptions): string {
  const [provider, vendor] = serviceIds(connection).map((value) => value.toLowerCase());
  switch (provider) {
    case "aws":
      return "https://s3.console.aws.amazon.com/s3/home";
    case "qiniu":
      return "https://portal.qiniu.com/kodo/overview";
    case "oss":
      return "https://oss.console.aliyun.com/bucket";
    case "cos":
      return "https://console.cloud.tencent.com/cos/bucket";
    default:
      if (vendor === "digitalocean") return "https://cloud.digitalocean.com/spaces";
      return s3Endpoint(connection).toString();
  }
}
