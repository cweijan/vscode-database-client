import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import { s3WebsiteUrl } from "../database/s3Urls";
import type { ConnectionOptions, QueryResult } from "../database/types";
import { prettyBytes } from "../core/utilityService";
import {
  connectionTreeIcon,
  targetRemoteFileIcon,
  targetPresentationCollapsibleState,
  targetPresentationTreeIcon,
} from "../tree/targetTreeIcon";
import { targetRemoteTreePresentations } from "../tree/targetTreePresentation";

const RESOURCE_CONNECTION_STATE_KEY = "nosql.connections";

export interface ResourceStoredConnection extends ConnectionOptions {
  readonly name?: string;
  readonly disabled?: boolean;
  readonly [key: string]: unknown;
}

function displayName(connection: ResourceStoredConnection): string {
  return connection.name || connection.id || connection.host || connection.type;
}

function isS3(connection: ResourceStoredConnection): boolean {
  return connection.type === "S3";
}

function isFtp(connection: ResourceStoredConnection): boolean {
  return connection.type === "FTP";
}

function isWebDav(connection: ResourceStoredConnection): boolean {
  return connection.type === "WebDAV";
}

function emptyMessage(
  connection: ResourceStoredConnection,
  root: boolean,
): string {
  if (isS3(connection) && root) return "No bucket found!";
  if (isWebDav(connection) && root) return "No folder found!";
  if (isWebDav(connection)) return "This folder is empty";
  return "This folder has no files.";
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function configuredS3Buckets(connection: ResourceStoredConnection): string[] {
  const s3 = record(connection.options?.s3);
  const configured = s3?.includeBuckets ?? connection.options?.includeBuckets;
  if (typeof configured !== "string") return [];
  return configured.split(",").map((value) => value.trim()).filter(Boolean);
}

function entryPath(parentPath: string, name: string): string {
  if (parentPath === "/") return `/${name}`;
  return `${parentPath.replace(/\/$/, "")}/${name}`;
}

function resourceDate(value: unknown): string {
  if (value == null) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (part: number): string => String(part).padStart(2, "0");
  const hours = date.getHours() % 12 || 12;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(hours)}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function resultRows(result: QueryResult<Record<string, unknown>>): Record<string, unknown>[] {
  return Array.isArray(result.rows) ? result.rows : [];
}

function rowText(row: Record<string, unknown>, key: string, fallback = ""): string {
  const value = row[key];
  return value == null ? fallback : String(value);
}

function fileLanguage(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const languages: Record<string, string> = {
    ".css": "css",
    ".csv": "csv",
    ".html": "html",
    ".js": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".py": "python",
    ".sh": "shellscript",
    ".sql": "sql",
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".vue": "vue",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
  };
  return languages[extension] || "plaintext";
}

class ResourceInfoNode extends vscode.TreeItem {
  public constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "info";
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

export class ResourceConnectionNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: ResourceStoredConnection,
    private readonly services: ExtensionServices,
    private readonly onDelete: (id: string) => Promise<void>,
    private readonly onRefresh: () => void = () => undefined,
    public readonly parent?: vscode.TreeItem,
  ) {
    super(displayName(connection), vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = `${connection.type.toLowerCase()}Connection`;
    this.description = connection.host || connection.connectionUrl || connection.type;
    this.iconPath = isFtp(connection)
      ? new vscode.ThemeIcon("server")
      : connectionTreeIcon(
        this.services.resources,
        connection,
        this.services.activeConnection.get(),
      );
  }

  public async getChildren(): Promise<Array<ResourceDirectoryNode | ResourceFileNode | ResourceInfoNode>> {
    if (this.connection.disabled) return [new ResourceInfoNode("Connection is disabled.")];
    await this.services.connections.getConnection(this.connection);
    const rows = resultRows(await this.query("LIST /"));
    const configuredBuckets = isS3(this.connection)
      ? configuredS3Buckets(this.connection)
      : [];
    const visible = rows.filter((row) =>
      configuredBuckets.length === 0
      || rowText(row, "kind") !== "directory"
      || configuredBuckets.includes(rowText(row, "name")),
    );
    const filtered = isWebDav(this.connection)
      ? visible.filter((row) => rowText(row, "kind") === "directory")
      : visible;
    if (!filtered.length) return [new ResourceInfoNode(emptyMessage(this.connection, true))];
    const directories = filtered
      .filter((row) => rowText(row, "kind") === "directory")
      .sort((left, right) => rowText(left, "name").localeCompare(rowText(right, "name")))
      .map((row) => new ResourceDirectoryNode(
        this.connection,
        rowText(row, "path", entryPath("/", rowText(row, "name"))),
        this.services,
        this,
        this.onRefresh,
        {
          created: row.created,
          modified: row.modified,
        },
      ));
    const files = filtered
      .filter((row) => rowText(row, "kind") !== "directory")
      .sort((left, right) => rowText(left, "name").localeCompare(rowText(right, "name")))
      .map((row) => new ResourceFileNode(
        this.connection,
        {
          name: rowText(row, "name"),
          path: rowText(row, "path", entryPath("/", rowText(row, "name"))),
          size: row.size,
          created: row.created,
          modified: row.modified,
        },
        this.services,
        this,
      ));
    return [...directories, ...files];
  }

  public async openConnection(): Promise<void> {
    await this.services.connections.getConnection(this.connection);
    this.services.activeConnection.set(this.connection);
    void vscode.window.showInformationMessage(`Connected to ${displayName(this.connection)}.`);
  }

  public async deleteConnection(): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
      `Delete connection ${displayName(this.connection)}?`,
      { modal: true },
      "Confirm",
    );
    if (confirmed === "Confirm") await this.onDelete(this.connection.id);
  }

  public async copyName(): Promise<void> {
    await vscode.env.clipboard.writeText(displayName(this.connection));
  }

  public copy(): Promise<void> {
    return this.copyName();
  }

  public refresh(): void {
    this.onRefresh();
  }

  public async newBucket(): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: "S3 bucket name" });
    if (!name) return;
    await this.query(`MKDIR /${name}`);
  }

  public async selectBuckets(): Promise<void> {
    if (!isS3(this.connection)) throw new Error("Bucket selection requires an S3 connection");
    const buckets = resultRows(await this.query("LIST /"))
      .filter((row) => rowText(row, "kind") === "directory")
      .map((row) => rowText(row, "name"))
      .filter(Boolean);
    const selected = configuredS3Buckets(this.connection);
    const picked = await vscode.window.showQuickPick(
      buckets.map((label) => ({ label, picked: selected.includes(label) })),
      { canPickMany: true, title: "Select displayed buckets" },
    );
    if (!picked) return;
    await this.saveS3Buckets(picked.length ? picked.map((item) => item.label).join(",") : null);
    this.onRefresh();
  }

  public async openSite(): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(s3WebsiteUrl(this.connection)));
  }

  public async fileManager(): Promise<void> {
    await this.openFileManager(`${displayName(this.connection)} · files`);
  }

  public async connectToNewWindow(): Promise<void> {
    await this.openFileManager(`${displayName(this.connection)} · files`);
  }

  private async openFileManager(title: string): Promise<void> {
    await this.services.webviews.createWebviewPanel({
      title,
      type: "fileManager",
      route: "fileManager",
      state: { connection: this.connection },
    });
  }

  private async query(source: string): Promise<QueryResult<Record<string, unknown>>> {
    return this.services.connections.query(this.connection, source);
  }

  private async saveS3Buckets(includeBuckets: string | null): Promise<void> {
    const currentOptions = this.connection.options || {};
    const currentS3 = record(currentOptions.s3) || {};
    const nextOptions = {
      ...currentOptions,
      s3: { ...currentS3, includeBuckets },
    };
    const nextConnection: ResourceStoredConnection = {
      ...this.connection,
      options: nextOptions,
    };
    this.connection.options = nextOptions;

    const raw = this.services.state.get<unknown>(RESOURCE_CONNECTION_STATE_KEY, {});
    if (Array.isArray(raw)) {
      await this.services.state.update(
        RESOURCE_CONNECTION_STATE_KEY,
        raw.map((item) => record(item)?.id === this.connection.id ? nextConnection : item),
      );
      return;
    }
    const connections = record(raw) || {};
    await this.services.state.update(RESOURCE_CONNECTION_STATE_KEY, {
      ...connections,
      [this.connection.id]: nextConnection,
    });
  }
}

export class ResourceDirectoryNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: ResourceStoredConnection,
    public readonly remotePath: string,
    private readonly services: ExtensionServices,
    public readonly parent: ResourceConnectionNode | ResourceDirectoryNode,
    private readonly onRefresh: () => void = () => undefined,
    private readonly metadata: ResourceEntryMetadata = {},
  ) {
    const presentation = isS3(connection) && parent instanceof ResourceConnectionNode
      ? targetRemoteTreePresentations.s3RootFolder
      : targetRemoteTreePresentations.remoteFolder;
    super(
      remotePath === "/" ? "/" : path.posix.basename(remotePath.replace(/\/$/, "")),
      targetPresentationCollapsibleState(presentation),
    );
    this.contextValue = presentation.contextValue;
    const date = resourceDate(
      isS3(connection) ? this.metadata.created ?? this.metadata.modified : this.metadata.modified,
    );
    this.tooltip = date || remotePath;
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
  }

  public async getChildren(): Promise<Array<ResourceDirectoryNode | ResourceFileNode | ResourceInfoNode>> {
    const result = await this.query(`LIST ${this.remotePath}`);
    const configuredBuckets = this.remotePath === "/" && isS3(this.connection)
      ? configuredS3Buckets(this.connection)
      : [];
    const rows = resultRows(result).filter((row) =>
      configuredBuckets.length === 0 || rowText(row, "kind") !== "directory" || configuredBuckets.includes(rowText(row, "name")),
    );
    if (!rows.length) return [new ResourceInfoNode(emptyMessage(this.connection, false))];
    const directories = rows
      .filter((row) => rowText(row, "kind") === "directory")
      .sort((left, right) => rowText(left, "name").localeCompare(rowText(right, "name")))
      .map((row) => new ResourceDirectoryNode(
        this.connection,
        rowText(row, "path", entryPath(this.remotePath, rowText(row, "name"))),
        this.services,
        this,
        this.onRefresh,
        {
          created: row.created,
          modified: row.modified,
        },
      ));
    const files = rows
      .filter((row) => rowText(row, "kind") !== "directory")
      .sort((left, right) => rowText(left, "name").localeCompare(rowText(right, "name")))
      .map((row) => new ResourceFileNode(
        this.connection,
        {
          name: rowText(row, "name"),
          path: rowText(row, "path", entryPath(this.remotePath, rowText(row, "name"))),
          size: row.size,
          created: row.created,
          modified: row.modified,
        },
        this.services,
        this,
      ));
    return [...directories, ...files];
  }

  public async newFile(): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: "Remote file name" });
    if (!name) return;
    await this.query(`WRITE ${entryPath(this.remotePath, name)}\n`);
    this.refresh();
  }

  public async newFolder(): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: "Remote folder name" });
    if (!name) return;
    await this.query(`MKDIR ${entryPath(this.remotePath, name)}`);
    this.refresh();
  }

  public async upload(): Promise<void> {
    const files = await vscode.window.showOpenDialog({ canSelectMany: true, canSelectFolders: false });
    if (!files?.length) return;
    for (const file of files) {
      const content = await readFile(file.fsPath);
      await this.query(`WRITE ${entryPath(this.remotePath, path.basename(file.fsPath))}\n${content.toString("base64")}`);
    }
    this.refresh();
  }

  public async uploadFolder(): Promise<void> {
    const folders = await vscode.window.showOpenDialog({ canSelectMany: false, canSelectFolders: true, canSelectFiles: false });
    const folder = folders?.[0];
    if (!folder) return;
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*"));
    for (const file of files) {
      const relative = path.relative(folder.fsPath, file.fsPath).split(path.sep).join("/");
      const content = await readFile(file.fsPath);
      await this.query(`WRITE ${entryPath(this.remotePath, relative)}\n${content.toString("base64")}`);
    }
    this.refresh();
  }

  public async download(): Promise<void> {
    const target = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false });
    if (!target?.[0]) return;
    for (const child of await this.getChildren()) {
      if (child instanceof ResourceFileNode) {
        await child.downloadTo(path.join(target[0].fsPath, String(child.label)));
      }
    }
  }

  public async delete(): Promise<void> {
    if (!(await this.confirm(`Delete remote folder ${this.remotePath}?`))) return;
    await this.query(`DELETE ${this.remotePath}`);
    this.refresh();
  }

  public async rename(): Promise<void> {
    const currentName = path.posix.basename(this.remotePath.replace(/\/$/, ""));
    const name = await vscode.window.showInputBox({ prompt: "New remote folder name", value: currentName });
    if (!name || name === currentName) return;
    await this.query(`RENAME ${this.remotePath}\n${entryPath(path.posix.dirname(this.remotePath), name)}`);
    this.refresh();
  }

  public async copyPath(): Promise<void> {
    await vscode.env.clipboard.writeText(this.remotePath);
  }

  public refresh(): void {
    this.onRefresh();
  }

  private async query(source: string): Promise<QueryResult<Record<string, unknown>>> {
    return this.services.connections.query(this.connection, source);
  }

  private async confirm(message: string): Promise<boolean> {
    return (await vscode.window.showWarningMessage(message, { modal: true }, "Confirm")) === "Confirm";
  }
}

interface ResourceFileEntry {
  name: string;
  path: string;
  size?: unknown;
  created?: unknown;
  modified?: unknown;
}

interface ResourceEntryMetadata {
  readonly created?: unknown;
  readonly modified?: unknown;
}

export class ResourceFileNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: ResourceStoredConnection,
    public readonly entry: ResourceFileEntry,
    private readonly services: ExtensionServices,
    public readonly parent: ResourceConnectionNode | ResourceDirectoryNode,
  ) {
    super(entry.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = isS3(connection) ? "s3File" : "file";
    this.description = entry.size == null ? undefined : prettyBytes(entry.size);
    const date = resourceDate(entry.modified);
    this.tooltip = date
      ? isS3(connection) ? `Create time: ${date}` : date
      : entry.path;
    this.iconPath = targetRemoteFileIcon(this.services.resources, entry.name);
  }

  public async open(): Promise<void> {
    const result = await this.query(`READ ${this.entry.path}`);
    const content = rowText(resultRows(result)[0] || {}, "contentBase64");
    const document = await vscode.workspace.openTextDocument({
      content: Buffer.from(content, "base64").toString("utf8"),
      language: fileLanguage(this.entry.name),
    });
    const saveSubscription = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() !== document.uri.toString()) return;
      void this.query(`WRITE ${this.entry.path}\n${Buffer.from(saved.getText(), "utf8").toString("base64")}`);
    });
    const closeSubscription = vscode.workspace.onDidCloseTextDocument((closed) => {
      if (closed.uri.toString() !== document.uri.toString()) return;
      saveSubscription.dispose();
      closeSubscription.dispose();
    });
    await vscode.window.showTextDocument(document);
  }

  public async delete(): Promise<void> {
    if (!(await this.confirm(`Delete remote file ${this.entry.path}?`))) return;
    await this.query(`DELETE ${this.entry.path}`);
    this.parent.refresh();
  }

  public async rename(): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: "New remote file name", value: this.entry.name });
    if (!name || name === this.entry.name) return;
    await this.query(`RENAME ${this.entry.path}\n${entryPath(path.posix.dirname(this.entry.path), name)}`);
    this.parent.refresh();
  }

  public async download(): Promise<void> {
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(this.entry.name), saveLabel: "Download" });
    if (target) await this.downloadTo(target.fsPath);
  }

  public async downloadTo(localPath: string): Promise<void> {
    const result = await this.query(`READ ${this.entry.path}`);
    const content = rowText(resultRows(result)[0] || {}, "contentBase64");
    await writeFile(localPath, Buffer.from(content, "base64"));
    void vscode.window.showInformationMessage(`Downloaded ${this.entry.name}.`);
  }

  public async copyPath(): Promise<void> {
    await vscode.env.clipboard.writeText(this.entry.path);
  }

  public async openDocument(): Promise<void> {
    await this.open();
  }

  public async doFavorite(): Promise<void> {
    await this.copyPath();
  }

  public async clear(): Promise<void> {
    await this.copyPath();
  }

  public async getTempUrl(): Promise<void> {
    await this.copyS3Url("URL_TEMP", "temporary");
  }

  public async getPublicUrl(): Promise<void> {
    await this.copyS3Url("URL_PUBLIC", "public");
  }

  private async query(source: string): Promise<QueryResult<Record<string, unknown>>> {
    return this.services.connections.query(this.connection, source);
  }

  private async copyS3Url(
    operation: "URL_TEMP" | "URL_PUBLIC",
    label: "temporary" | "public",
  ): Promise<void> {
    try {
      const result = await this.query(`${operation} ${this.entry.path}`);
      const url = rowText(resultRows(result)[0] || {}, "url");
      if (!url) throw new Error(`The S3 ${label} URL was empty`);
      await vscode.env.clipboard.writeText(url);
      void vscode.window.showInformationMessage(`The ${label} URL has been copied into the clipboard.`);
    } catch (error) {
      void vscode.window.showErrorMessage(errorMessage(error));
    }
  }

  private async confirm(message: string): Promise<boolean> {
    return (await vscode.window.showWarningMessage(message, { modal: true }, "Confirm")) === "Confirm";
  }
}
