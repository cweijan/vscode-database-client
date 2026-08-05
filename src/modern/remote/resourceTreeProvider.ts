import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions, QueryResult } from "../database/types";

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

function entryPath(parentPath: string, name: string): string {
  if (parentPath === "/") return `/${name}`;
  return `${parentPath.replace(/\/$/, "")}/${name}`;
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
    this.iconPath = new vscode.ThemeIcon(connection.type === "S3" ? "cloud" : "remote-explorer");
  }

  public async getChildren(): Promise<Array<ResourceDirectoryNode | ResourceInfoNode>> {
    if (this.connection.disabled) return [new ResourceInfoNode("Connection is disabled.")];
    await this.services.connections.getConnection(this.connection);
    return [new ResourceDirectoryNode(this.connection, "/", this.services, this, this.onRefresh)];
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

  public async newBucket(): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: "S3 bucket name" });
    if (!name) return;
    await this.query(`MKDIR /${name}`);
  }

  public async selectBuckets(): Promise<void> {
    await this.openFileManager("S3 Buckets");
  }

  public async openSite(): Promise<void> {
    const url = this.connection.connectionUrl;
    if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
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
}

export class ResourceDirectoryNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: ResourceStoredConnection,
    public readonly remotePath: string,
    private readonly services: ExtensionServices,
    public readonly parent: ResourceConnectionNode | ResourceDirectoryNode,
    private readonly onRefresh: () => void = () => undefined,
  ) {
    super(
      remotePath === "/" ? "/" : path.posix.basename(remotePath.replace(/\/$/, "")),
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.contextValue = isS3(connection) ? "s3Folder" : "folder";
    this.tooltip = remotePath;
    this.iconPath = new vscode.ThemeIcon("folder");
  }

  public async getChildren(): Promise<Array<ResourceDirectoryNode | ResourceFileNode | ResourceInfoNode>> {
    const result = await this.query(`LIST ${this.remotePath}`);
    const rows = resultRows(result);
    if (!rows.length) return [new ResourceInfoNode("There are no files in this folder.")];
    const directories = rows
      .filter((row) => rowText(row, "kind") === "directory")
      .sort((left, right) => rowText(left, "name").localeCompare(rowText(right, "name")))
      .map((row) => new ResourceDirectoryNode(
        this.connection,
        rowText(row, "path", entryPath(this.remotePath, rowText(row, "name"))),
        this.services,
        this,
        this.onRefresh,
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
  modified?: unknown;
}

export class ResourceFileNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: ResourceStoredConnection,
    public readonly entry: ResourceFileEntry,
    private readonly services: ExtensionServices,
    public readonly parent: ResourceDirectoryNode,
  ) {
    super(entry.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = isS3(connection) ? "s3File" : "file";
    this.description = entry.size == null ? undefined : `${String(entry.size)} bytes`;
    this.tooltip = entry.path;
    this.iconPath = new vscode.ThemeIcon("file");
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

  private async query(source: string): Promise<QueryResult<Record<string, unknown>>> {
    return this.services.connections.query(this.connection, source);
  }

  private async confirm(message: string): Promise<boolean> {
    return (await vscode.window.showWarningMessage(message, { modal: true }, "Confirm")) === "Confirm";
  }
}
