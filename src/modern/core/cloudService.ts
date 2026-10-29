import {
  createDecipheriv,
  createVerify,
} from "node:crypto";

import type { Logger } from "./contracts";
import type { MementoLike } from "./state";

export interface CloudUser {
  readonly email?: string;
  readonly expireTime?: number | string;
  readonly nickName?: string;
  readonly sign?: string;
  readonly timestamp?: number | string;
  readonly token?: string;
  readonly [key: string]: unknown;
}

export interface CloudServiceOptions {
  readonly apiBaseUrl?: string;
}

export interface CloudSyncDescriptor {
  readonly s3Url?: string;
  readonly v2?: boolean;
  readonly [key: string]: unknown;
}

const licensePublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7wmGiAsVw3UZY9xSxBzQ8VaarZfdSRkD7MtlhzMSV+4tOLMN/Vfe6X0HlsE1NFHYdEjXXo81OQe1vOfXGLtcbKKWBOshrArTojitJjRHMHW7yDKs3ifClM6xvycXUTDmHvjZKNooMUqNGNyXcTr/h+BcWmMAoegxu10L9GcI0RN7W8wGNHlJsaVRXRXZVFpGzZ/8B8bdiGvjkyT+iqCDFaHQk+050A9CxaHIdNFfBPOxlqD9g+23BxYnv7JXH38oF11+V/Zj7+w+naQ7wfZswD/QK27qIEFD1leknJrls6J3Gk1QP7NtZANtmEXrVpox6R9a/IKofsaQ2f8kMAmRuQIDAQAB
-----END PUBLIC KEY-----`;

const licenseKey = Buffer.from("BDFHJLNPpnljhfdb", "utf8");
const licenseIv = Buffer.from("qeO9xrUlSC7bK2s3", "utf8");

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function userValue(value: unknown): CloudUser | undefined {
  const candidate = record(value);
  return Object.keys(candidate).length > 0 ? candidate as CloudUser : undefined;
}

function verifySignature(value: string, signature: string): boolean {
  try {
    const verifier = createVerify("md5WithRSAEncryption");
    verifier.update(value, "utf8");
    verifier.end();
    return verifier.verify(licensePublicKey, signature, "base64");
  } catch {
    return false;
  }
}

function decodeLicense(value: string): Record<string, unknown> {
  const source = value.trim();
  try {
    const parsed: unknown = JSON.parse(source);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // The target also accepts its encrypted license form.
  }
  const decipher = createDecipheriv("aes-128-cbc", licenseKey, licenseIv);
  const decoded = Buffer.concat([
    decipher.update(Buffer.from(source, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed: unknown = JSON.parse(decoded);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid license payload");
  }
  return parsed as Record<string, unknown>;
}

function numeric(value: unknown): number | undefined {
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

export class CloudService {
  private readonly apiBaseUrl: string;
  private readonly userListeners = new Set<(user: CloudUser | undefined) => void>();

  public constructor(
    private readonly storage: MementoLike,
    private readonly machineId: string,
    private readonly logger: Logger,
    options: CloudServiceOptions = {},
  ) {
    this.apiBaseUrl = (options.apiBaseUrl || "https://app.database-client.com").replace(/\/+$/, "");
  }

  public getUser(): CloudUser | undefined {
    return userValue(this.storage.get<unknown>("user"));
  }

  public onUserChanged(
    listener: (user: CloudUser | undefined) => void,
  ): { dispose: () => void } {
    this.userListeners.add(listener);
    return {
      dispose: () => this.userListeners.delete(listener),
    };
  }

  public async setUser(value: unknown, trusted = false): Promise<CloudUser | undefined> {
    const user = userValue(value);
    if (user?.sign && !trusted) {
      const email = String(user.email || "");
      const timestamp = String(user.timestamp || "");
      if (!email || !timestamp || !verifySignature(email + timestamp, user.sign)) {
        throw new Error("Unable to verify account response");
      }
      const signedAt = numeric(user.timestamp);
      if (signedAt && Date.now() - signedAt > 24 * 60 * 60 * 1000) {
        throw new Error("Login info is expired");
      }
    }
    const normalized = user
      ? { ...user, nickName: String(user.nickName || user.email || "").replaceAll("+", " ").trim() }
      : undefined;
    await this.storage.update("user", normalized);
    if (normalized?.email) {
      await this.storage.update("USER_EMAIL", normalized.email);
    }
    for (const listener of this.userListeners) {
      listener(normalized);
    }
    return normalized;
  }

  public getEmail(): string {
    return this.storage.get<string>("USER_EMAIL") || this.getUser()?.email || "";
  }

  public async saveEmail(value: unknown): Promise<void> {
    const email = String(value || "").trim();
    if (email) await this.storage.update("USER_EMAIL", email);
  }

  public getMachineId(): string {
    return this.machineId;
  }

  public getSyncKey(): string {
    return this.storage.get<string>("SYNC_KEY_STATE") || "";
  }

  public async setSyncKey(value: string | undefined): Promise<void> {
    const keyPath = value?.trim() || undefined;
    await this.storage.update("SYNC_KEY_STATE", keyPath);
  }

  public isPay(user = this.getUser()): boolean {
    const expireTime = numeric(user?.expireTime);
    return expireTime !== undefined && expireTime > Date.now();
  }

  public async login(email: string, password: string): Promise<CloudUser> {
    const user = await this.request<CloudUser>("/user/login", {
      method: "POST",
      body: { email, password },
    });
    return (await this.setUser(user)) || user;
  }

  public async bindLicense(value: string): Promise<CloudUser | undefined> {
    const license = decodeLicense(value);
    const licenseId = String(license.licenseId || "");
    const email = String(license.email || "");
    const signature = String(license.sign || "");
    if (licenseId) {
      if (!verifySignature(licenseId, signature)) {
        throw new Error("Unable to verify license");
      }
      const user = await this.request<CloudUser>("/license/active", {
        method: "POST",
        body: { licenseId, machineId: this.machineId, email },
      });
      return this.setUser(user, true);
    }
    const timestamp = String(license.timestamp || "");
    if (!email || !timestamp || !verifySignature(email + timestamp + this.machineId, signature)) {
      throw new Error("Unable to verify license");
    }
    return this.setUser(license, true);
  }

  public async uploadSyncArchive(archive: Uint8Array): Promise<void> {
    const form = new FormData();
    const bytes = new Uint8Array(new ArrayBuffer(archive.byteLength));
    bytes.set(archive);
    form.append("file", new Blob([bytes.buffer], { type: "application/zip" }));
    const response = await this.requestResponse("/sync/v2/upload", {
      method: "POST",
      body: form,
    });
    await this.readResponse(response, "/sync/v2/upload");
  }

  public async removeSyncArchive(): Promise<void> {
    const response = await this.requestResponse("/sync/removeAll", { method: "GET" });
    await this.readResponse(response, "/sync/removeAll");
  }

  public async downloadSyncArchive(): Promise<Buffer> {
    const descriptor = await this.request<CloudSyncDescriptor>("/sync/get", {
      method: "GET",
    });
    const url = typeof descriptor.s3Url === "string" ? descriptor.s3Url : "";
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("Cloud configuration did not provide a downloadable archive");
    }
    const response = await fetch(url, { headers: { Accept: "application/zip" } });
    if (!response.ok) {
      throw new Error(`Cloud archive download failed (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async request<T>(
    route: string,
    options: { readonly method: "GET" | "POST"; readonly body?: unknown },
  ): Promise<T> {
    const response = await this.requestResponse(route, {
      method: options.method,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body), contentType: "application/json" }),
    });
    const raw = await this.readResponse(response, route);
    const envelope = record(raw);
    const data = envelope.code === 200 ? envelope.data : envelope.data ?? raw;
    if (data === undefined) {
      throw new Error("Account server returned an empty response");
    }
    this.logger.debug(`Cloud request completed: ${route}`);
    return data as T;
  }

  private async requestResponse(
    route: string,
    options: {
      readonly method: "GET" | "POST";
      readonly body?: BodyInit;
      readonly contentType?: string;
    },
  ): Promise<Response> {
    return fetch(new URL(route, this.apiBaseUrl), {
      method: options.method,
      headers: {
        Accept: "application/json",
        ...(this.getUser()?.token ? { token: String(this.getUser()?.token) } : {}),
        ...(options.contentType ? { "Content-Type": options.contentType } : {}),
      },
      body: options.body,
    });
  }

  private async readResponse(response: Response, route: string): Promise<unknown> {
    const raw: unknown = await response.json().catch(() => undefined);
    const envelope = record(raw);
    if (!response.ok || envelope.code === 400) {
      throw new Error(String(envelope.message || `Account request failed (${response.status})`));
    }
    this.logger.debug(`Cloud request completed: ${route}`);
    return raw;
  }
}

export { decodeLicense, verifySignature };
