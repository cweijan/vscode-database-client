import * as path from "node:path";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions, QueryResult } from "../database/types";
import { asConnectionOptions } from "../database/connectionOptions";
import { boundRemotePath, normalizeRemotePath, parentRemotePath } from "./remotePaths";
import type { RemoteEntry, SshConnectionOptions } from "./sshService";

interface FileEntry {
  readonly name: string;
  readonly path: string;
  readonly type: vscode.FileType;
  readonly size: number;
  readonly ctime?: number;
  readonly mtime?: number;
}

function asConnection(value: unknown, idHint?: string): ConnectionOptions | undefined {
  return asConnectionOptions(value, idHint);
}

function connectionRecords(value: unknown): ConnectionOptions[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asConnection(item))
      .filter((item): item is ConnectionOptions => item !== undefined);
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .map(([id, item]) => asConnection(item, id))
    .filter((item): item is ConnectionOptions => item !== undefined);
}

function rows(result: QueryResult<Record<string, unknown>>): Record<string, unknown>[] {
  return Array.isArray(result.rows) ? result.rows : [];
}

function stringValue(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const direct = row[key];
    if (direct !== undefined && direct !== null) return String(direct);
    const matching = Object.keys(row).find(
      (candidate) => candidate.toLocaleLowerCase() === key.toLocaleLowerCase(),
    );
    if (matching && row[matching] !== undefined && row[matching] !== null) {
      return String(row[matching]);
    }
  }
  return "";
}

function numberValue(row: Record<string, unknown>, ...keys: string[]): number {
  const value = Number(stringValue(row, ...keys));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function modifiedValue(row: Record<string, unknown>): number | undefined {
  const raw = row.modified ?? row.mtime ?? row.modifiedAt;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 10_000_000_000 ? raw * 1000 : raw;
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function remoteType(kind: RemoteEntry["kind"] | string): vscode.FileType {
  switch (kind.toLocaleLowerCase()) {
    case "directory":
    case "folder":
      return vscode.FileType.Directory;
    case "link":
    case "symboliclink":
      return vscode.FileType.SymbolicLink;
    default:
      return vscode.FileType.File;
  }
}

function toFileEntry(entry: RemoteEntry): FileEntry {
  return {
    name: entry.name,
    path: normalizeRemotePath(entry.path),
    type: remoteType(entry.kind),
    size: Math.max(0, entry.size || 0),
    mtime: entry.modifiedAt?.getTime(),
  };
}

function resourceEntry(row: Record<string, unknown>, parent: string): FileEntry {
  const name = stringValue(row, "name", "filename", "fileName");
  const remotePath = normalizeRemotePath(
    stringValue(row, "path") || `${parent.replace(/\/$/, "")}/${name}`,
  );
  return {
    name: name || path.posix.basename(remotePath),
    path: remotePath,
    type: remoteType(stringValue(row, "kind", "type", "fileType")),
    size: numberValue(row, "size", "bytes"),
    mtime: modifiedValue(row),
  };
}

function uriConnectionKey(uri: vscode.Uri): string {
  const queryKey = new URLSearchParams(uri.query).get("key");
  return decodeURIComponent(queryKey || uri.authority);
}

function fileTypeFromEntry(entry: FileEntry): vscode.FileType {
  return entry.type === vscode.FileType.SymbolicLink
    ? vscode.FileType.SymbolicLink
    : entry.type === vscode.FileType.Directory
      ? vscode.FileType.Directory
      : vscode.FileType.File;
}

export class ModernRemoteFileSystemProvider implements vscode.FileSystemProvider {
  private readonly changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

  public constructor(private readonly services: ExtensionServices) {}

  public get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
    return this.changes.event;
  }

  public watch(_uri: vscode.Uri): vscode.Disposable {
    return { dispose: () => undefined };
  }

  public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const remotePath = normalizeRemotePath(uri.path);
    if (remotePath === "/") {
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }
    const entry = await this.findEntry(uri, remotePath);
    if (!entry) throw vscode.FileSystemError.FileNotFound(uri);
    return {
      type: fileTypeFromEntry(entry),
      ctime: entry.ctime || 0,
      mtime: entry.mtime || 0,
      size: entry.size,
    };
  }

  public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const parent = normalizeRemotePath(uri.path);
    const entries = await this.list(uri, parent);
    return entries.map((entry) => [entry.name, fileTypeFromEntry(entry)]);
  }

  public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const connection = this.connection(uri);
    const remotePath = this.boundPath(uri.path);
    if (connection.type === "SSH" || connection.type === "SFTP") {
      const session = await this.services.ssh.open(connection as SshConnectionOptions);
      return session.readFile(remotePath);
    }
    const result = await this.services.connections.query<Record<string, unknown>>(
      connection,
      `READ ${remotePath}`,
    );
    const row = rows(result)[0] || {};
    const base64 = stringValue(row, "contentBase64", "base64");
    if (base64) return Buffer.from(base64, "base64");
    return Buffer.from(stringValue(row, "content"), "utf8");
  }

  public async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    _options: { readonly create: boolean; readonly overwrite: boolean },
  ): Promise<void> {
    const connection = this.connection(uri);
    const remotePath = this.boundPath(uri.path);
    if (connection.type === "SSH" || connection.type === "SFTP") {
      const session = await this.services.ssh.open(connection as SshConnectionOptions);
      await session.writeFile(remotePath, Buffer.from(content));
    } else {
      await this.services.connections.query(
        connection,
        `WRITE ${remotePath}\n${Buffer.from(content).toString("base64")}`,
      );
    }
    this.fire(uri, vscode.FileChangeType.Changed);
  }

  public async createDirectory(uri: vscode.Uri): Promise<void> {
    const connection = this.connection(uri);
    const remotePath = this.boundPath(uri.path);
    if (connection.type === "SSH" || connection.type === "SFTP") {
      const session = await this.services.ssh.open(connection as SshConnectionOptions);
      await session.mkdir(remotePath, true);
    } else {
      await this.services.connections.query(connection, `MKDIR ${remotePath}`);
    }
    this.fire(uri, vscode.FileChangeType.Created);
  }

  public async delete(
    uri: vscode.Uri,
    options: { readonly recursive: boolean },
  ): Promise<void> {
    const connection = this.connection(uri);
    const remotePath = this.boundPath(uri.path);
    if (connection.type === "SSH" || connection.type === "SFTP") {
      const session = await this.services.ssh.open(connection as SshConnectionOptions);
      const stat = await this.stat(uri);
      await session.remove(remotePath, stat.type === vscode.FileType.Directory || options.recursive);
    } else {
      await this.services.connections.query(connection, `DELETE ${remotePath}`);
    }
    this.fire(uri, vscode.FileChangeType.Deleted);
  }

  public async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    _options: { readonly overwrite: boolean },
  ): Promise<void> {
    this.assertSameConnection(oldUri, newUri);
    const connection = this.connection(oldUri);
    const oldPath = this.boundPath(oldUri.path);
    const newPath = this.boundPath(newUri.path);
    if (connection.type === "SSH" || connection.type === "SFTP") {
      const session = await this.services.ssh.open(connection as SshConnectionOptions);
      await session.rename(oldPath, newPath);
    } else {
      await this.services.connections.query(connection, `RENAME ${oldPath}\n${newPath}`);
    }
    this.fire(oldUri, vscode.FileChangeType.Deleted);
    this.fire(newUri, vscode.FileChangeType.Created);
  }

  public async copy(
    source: vscode.Uri,
    destination: vscode.Uri,
    options: { readonly overwrite: boolean },
  ): Promise<void> {
    this.assertSameConnection(source, destination);
    const sourceStat = await this.stat(source);
    if (sourceStat.type === vscode.FileType.Directory) {
      await this.createDirectory(destination);
      for (const [name] of await this.readDirectory(source)) {
        await this.copy(
          source.with({ path: `${source.path.replace(/\/$/, "")}/${name}` }),
          destination.with({ path: `${destination.path.replace(/\/$/, "")}/${name}` }),
          options,
        );
      }
      return;
    }
    const content = await this.readFile(source);
    await this.writeFile(destination, content, {
      create: true,
      overwrite: options.overwrite,
    });
  }

  private connection(uri: vscode.Uri): ConnectionOptions {
    const key = uriConnectionKey(uri);
    const connections = [
      ...connectionRecords(this.services.state.get("nosql.connections", {})),
      ...connectionRecords(this.services.state.get("database.connections", {})),
    ];
    const connection = connections.find((item) => item.id === key);
    if (!connection) throw vscode.FileSystemError.FileNotFound(uri);
    if (!["SSH", "SFTP", "FTP", "WebDAV"].includes(connection.type)) {
      throw vscode.FileSystemError.Unavailable(`Unsupported remote connection: ${connection.type}`);
    }
    return connection;
  }

  private boundPath(value: string): string {
    return boundRemotePath(value, "/");
  }

  private async list(uri: vscode.Uri, remotePath: string): Promise<FileEntry[]> {
    const connection = this.connection(uri);
    if (connection.type === "SSH" || connection.type === "SFTP") {
      const session = await this.services.ssh.open(connection as SshConnectionOptions);
      return (await session.list(this.boundPath(remotePath))).map(toFileEntry);
    }
    const result = await this.services.connections.query<Record<string, unknown>>(
      connection,
      `LIST ${this.boundPath(remotePath)}`,
    );
    return rows(result).map((row) => resourceEntry(row, remotePath));
  }

  private async findEntry(uri: vscode.Uri, remotePath: string): Promise<FileEntry | undefined> {
    const parent = parentRemotePath(remotePath);
    const name = path.posix.basename(remotePath);
    return (await this.list(uri, parent)).find((entry) => entry.name === name);
  }

  private assertSameConnection(left: vscode.Uri, right: vscode.Uri): void {
    if (uriConnectionKey(left) !== uriConnectionKey(right)) {
      throw vscode.FileSystemError.NoPermissions("Cross-connection file operations are not supported");
    }
  }

  private fire(uri: vscode.Uri, type: vscode.FileChangeType): void {
    this.changes.fire([{ type, uri }]);
  }
}
