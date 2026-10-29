import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
} from "node:crypto";
import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";

import AdmZip from "adm-zip";

import type { Logger } from "./contracts";
import type { CloudService } from "./cloudService";
import {
  ConnectionConfigStore,
} from "./connectionConfigStore";

const LEGACY_IV = "qeO9xrUlSC7bK2s3";
const MODERN_PASSPHRASE = "slkdfjs;ldkjxclvkjsd;lfkjsdflksjdf";
const ZIP_CONFIG_NAME = "database-client-config.json";
const MAX_UPLOAD_FILE_SIZE = 1024 * 1024;
const QUERY_FILE = /\.(?:sql|sqlbook|es|dbclient-js)$/i;

export type CloudSyncType = "" | "merge";

export interface CloudSyncRequest {
  readonly keyPath?: string;
  readonly type?: CloudSyncType;
  readonly workspace?: boolean;
}

export interface CloudSyncResult {
  readonly settings: number;
  readonly state: number;
  readonly files: number;
}

export interface CloudConfigSnapshot {
  readonly database: Readonly<Record<string, unknown>>;
  readonly nosql: Readonly<Record<string, unknown>>;
  readonly $schema: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeArchivePath(rootPath: string, entryName: string): string | undefined {
  const normalized = entryName.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized === ZIP_CONFIG_NAME || normalized.includes("\0")) {
    return undefined;
  }
  const destination = path.resolve(rootPath, normalized);
  const relative = path.relative(path.resolve(rootPath), destination);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Cloud archive entry escapes the configuration directory: ${entryName}`);
  }
  return destination;
}

async function keyText(keyPath: string | undefined): Promise<string | undefined> {
  const source = keyPath?.trim();
  if (!source) return undefined;
  try {
    return await readFile(source, "utf8");
  } catch {
    throw new Error("The selected sync key does not exist or cannot be read");
  }
}

export function encryptSyncConfig(value: string, key: string): string {
  const derivedKey = pbkdf2Sync(key, "salt", 2145, 16, "sha512");
  const cipher = createCipheriv("aes-128-cbc", derivedKey, Buffer.from(LEGACY_IV, "utf8"));
  return cipher.update(value, "utf8", "base64") + cipher.final("base64");
}

function decryptModernSyncConfig(value: string): string | undefined {
  const source = Buffer.from(value, "base64");
  if (source.length <= 96) return undefined;
  const salt = source.subarray(0, 64);
  const iv = source.subarray(64, 80);
  const authTag = source.subarray(80, 96);
  const encrypted = source.subarray(96);
  const derivedKey = pbkdf2Sync(MODERN_PASSPHRASE, salt, 2145, 32, "sha512");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function decryptSyncConfig(value: string, key?: string): string {
  const source = value.trim();
  if (source.startsWith("{") || source.startsWith("//")) return value;
  try {
    const modern = decryptModernSyncConfig(source);
    if (modern) return modern;
  } catch {
    // Continue with the target's legacy key-file format.
  }
  if (!key) {
    throw new Error("The cloud configuration is encrypted; choose the sync key first");
  }
  const derivedKey = pbkdf2Sync(key, "salt", 2145, 16, "sha512");
  const decipher = createDecipheriv("aes-128-cbc", derivedKey, Buffer.from(LEGACY_IV, "utf8"));
  return decipher.update(Buffer.from(source, "base64"), undefined, "utf8") + decipher.final("utf8");
}

export function parseCloudConfig(
  value: string,
  key?: string,
): Record<string, unknown> {
  const parsed: unknown = JSON.parse(decryptSyncConfig(value, key));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Cloud configuration has an invalid format");
  }
  return parsed as Record<string, unknown>;
}

export class CloudConfigSyncService {
  public constructor(
    private readonly cloud: CloudService,
    private readonly connections: ConnectionConfigStore,
    private readonly rootPath: string,
    private readonly logger: Logger,
  ) {}

  public async upload(keyPath?: string, workspace = false): Promise<number> {
    const archive = await this.createArchive(keyPath, workspace, true);
    await this.cloud.uploadSyncArchive(archive);
    return archive.byteLength;
  }

  public remove(): Promise<void> {
    return this.cloud.removeSyncArchive();
  }

  public async download(request: CloudSyncRequest = {}): Promise<CloudSyncResult> {
    const archive = await this.cloud.downloadSyncArchive();
    return this.importArchive(archive, request);
  }

  public exportArchive(keyPath?: string, workspace = false): Promise<Buffer> {
    return this.createArchive(keyPath, workspace, false);
  }

  public importArchive(
    archive: Buffer,
    request: CloudSyncRequest = {},
  ): Promise<CloudSyncResult> {
    return this.applyArchive(archive, request);
  }

  public createSnapshot(workspace = false): CloudConfigSnapshot {
    const config = this.connections.config(workspace);
    return {
      database: config.database,
      nosql: config.nosql,
      $schema: config.$schema,
    };
  }

  private async createArchive(
    keyPath: string | undefined,
    workspace: boolean,
    uploadMode: boolean,
  ): Promise<Buffer> {
    const key = await keyText(keyPath);
    const snapshot = this.createSnapshot(workspace);
    const config = JSON.stringify(snapshot, null, 2);
    const zip = new AdmZip();
    zip.addFile(
      ZIP_CONFIG_NAME,
      Buffer.from(key ? encryptSyncConfig(config, key) : config, "utf8"),
    );
    await this.addFiles(zip, this.rootPath, "", uploadMode);
    return zip.toBuffer();
  }

  private async addFiles(
    zip: AdmZip,
    directory: string,
    relative = "",
    uploadMode = false,
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      const archivePath = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!relative && uploadMode && !["query", "storage"].includes(entry.name)) {
          continue;
        }
        await this.addFiles(zip, filePath, archivePath, uploadMode);
        continue;
      }
      if (!QUERY_FILE.test(entry.name) && entry.name !== "sshSnippets.json") continue;
      if (entry.name.toLocaleLowerCase().includes("history")) continue;
      const fileStat = await stat(filePath).catch(() => undefined);
      if (!fileStat || fileStat.size > MAX_UPLOAD_FILE_SIZE) continue;
      zip.addFile(archivePath.replaceAll("\\", "/"), await readFile(filePath));
    }
  }

  private async applyArchive(
    archive: Buffer,
    request: CloudSyncRequest,
  ): Promise<CloudSyncResult> {
    const key = await keyText(request.keyPath);
    const zip = new AdmZip(archive);
    const configEntry = zip.getEntry(ZIP_CONFIG_NAME);
    if (!configEntry) throw new Error("Cloud archive does not contain database-client-config.json");
    const config = zip.readAsText(configEntry);
    const snapshot = parseCloudConfig(config, key);
    const result = await this.applyConfig(
      snapshot,
      request.type === "merge",
      request.workspace === true,
    );
    let files = 0;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || entry.entryName === ZIP_CONFIG_NAME) continue;
      const target = safeArchivePath(this.rootPath, entry.entryName);
      if (!target) continue;
      if (request.type === "merge") {
        const existing = await stat(target).catch(() => undefined);
        if (existing) continue;
      }
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, entry.getData());
      files += 1;
    }
    return { ...result, files };
  }

  private async applyConfig(
    value: Record<string, unknown>,
    merge: boolean,
    workspace: boolean,
  ): Promise<Omit<CloudSyncResult, "files">> {
    const source = record(value);
    const legacyState = record(source.state);
    const database = source.database !== undefined
      ? source.database
      : legacyState["database.connections"] ?? legacyState["mysql.connections"];
    const nosql = source.nosql !== undefined
      ? source.nosql
      : legacyState["nosql.connections"] ?? legacyState["redis.connections"];
    const state = await this.connections.updateScope(workspace, database, nosql, merge);
    this.logger.debug("Cloud configuration applied", { settings: 0, state, merge, workspace });
    return { settings: 0, state };
  }
}
