import * as path from "node:path";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import { prettyBytes } from "../core/utilityService";
import { sshConnectionNamespace } from "../database/connectionOptions";
import type { ConnectionOptions } from "../database/types";
import {
  connectionTreeIcon,
  targetRemoteFileIcon,
  targetRemoteFolderIcon,
  targetThemePresentationIcon,
  targetResourceTreeIcon,
  targetPresentationCollapsibleState,
} from "../tree/targetTreeIcon";
import { targetRemoteTreePresentations } from "../tree/targetTreePresentation";
import { registerWebviewUtilityProtocols } from "../commands/webviewUtilityProtocols";
import {
  expandSshPath,
  type RemoteEntry,
  type SshConnectionOptions,
} from "./sshService";
import { shouldPruneSftpRootEntry as shouldPruneSftpRootEntryAtRoot } from "./sshSftpPresentation";

export interface SshStoredConnection extends ConnectionOptions {
  readonly name?: string;
  readonly disabled?: boolean;
  readonly [key: string]: unknown;
}

function displayName(connection: SshStoredConnection): string {
  if (connection.name) return connection.name;
  const configuredHost = sshOption(connection, "host");
  const host = connection.host
    || (typeof configuredHost === "string" && configuredHost.trim() ? configuredHost.trim() : "")
    || connection.id
    || "SSH";
  const configuredPort = connection.port ?? optionValue(connection, "port") ?? sshOption(connection, "port");
  const port = Number(configuredPort);
  return port === 22 || !Number.isInteger(port) ? host : `${host}@${port}`;
}

function asSshOptions(connection: SshStoredConnection): SshConnectionOptions {
  const host = sshOption(connection, "host");
  const configuredPort = sshOption(connection, "port");
  const username = sshOption(connection, "username") ?? sshOption(connection, "user");
  const password = sshOption(connection, "password");
  const port = Number(configuredPort);
  return {
    ...connection,
    type: "SSH",
    host: typeof host === "string" && host.trim() ? host.trim() : connection.host || "localhost",
    port: Number.isInteger(port) && port > 0 && port <= 65_535
      ? port
      : connection.port || 22,
    user: typeof username === "string" && username.trim() ? username.trim() : connection.user || "root",
    password: typeof password === "string" && password ? password : connection.password,
  };
}

function optionValue(connection: SshStoredConnection, key: string): unknown {
  return connection.options?.[key];
}

function sshOption(connection: SshStoredConnection, key: string): unknown {
  const direct = optionValue(connection, key) ?? connection[key];
  if (direct !== undefined) return direct;
  return sshConnectionNamespace(connection)[key];
}

function isNativeSsh(connection: SshStoredConnection): boolean {
  return String(sshOption(connection, "type") || "").toLowerCase() === "native";
}

function sshRootPath(connection: SshStoredConnection): string {
  const root = sshOption(connection, "ftpRoot");
  if (typeof root !== "string" || !root.trim()) return "/";
  return root.trim().replace(/\/+$/, "") || "/";
}

function showsHiddenFiles(connection: SshStoredConnection): boolean {
  const fsOptions = sshOption(connection, "fs");
  if (fsOptions && typeof fsOptions === "object" && !Array.isArray(fsOptions)) {
    return (fsOptions as Record<string, unknown>).showHidden !== false;
  }
  return sshOption(connection, "showHidden") !== false;
}

interface SshFavoriteEntry {
  readonly name: string;
  readonly path: string;
  readonly kind: RemoteEntry["kind"];
  readonly size: number;
}

function favoriteEntries(
  services: ExtensionServices,
  connectionId: string,
): SshFavoriteEntry[] {
  const raw = services.state.get<unknown>("favorite_map", {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const value = (raw as Record<string, unknown>)[connectionId];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SshFavoriteEntry => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Record<string, unknown>;
    return typeof candidate.path === "string"
      && typeof (candidate.name ?? candidate.filename) === "string";
  }).map((item) => {
    const candidate = item as SshFavoriteEntry & { readonly filename?: string };
    return {
      name: candidate.name || candidate.filename || path.basename(candidate.path),
      path: candidate.path,
      kind: candidate.kind || "file",
      size: Number.isFinite(candidate.size) ? candidate.size : 0,
    };
  });
}

function isFavorite(
  services: ExtensionServices,
  connectionId: string,
  remotePath: string,
): boolean {
  return favoriteEntries(services, connectionId).some((entry) => entry.path === remotePath);
}

async function toggleFavorite(
  services: ExtensionServices,
  connectionId: string,
  entry: SshFavoriteEntry,
): Promise<void> {
  const raw = services.state.get<unknown>("favorite_map", {});
  const map: Record<string, SshFavoriteEntry[]> = raw && typeof raw === "object" && !Array.isArray(raw)
    ? Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([key, value]) => [
      key,
      Array.isArray(value) ? favoriteEntriesFromUnknown(value) : [],
    ]))
    : {};
  const current = map[connectionId] || [];
  map[connectionId] = current.some((item) => item.path === entry.path)
    ? current.filter((item) => item.path !== entry.path)
    : [...current, entry];
  await services.state.update("favorite_map", map);
}

function favoriteEntriesFromUnknown(value: unknown[]): SshFavoriteEntry[] {
  return value.filter((item): item is SshFavoriteEntry => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Record<string, unknown>;
    return typeof candidate.path === "string"
      && typeof (candidate.name ?? candidate.filename) === "string";
  }).map((item) => {
    const candidate = item as SshFavoriteEntry & { readonly filename?: string };
    return {
      name: candidate.name || candidate.filename || path.basename(candidate.path),
      path: candidate.path,
      kind: candidate.kind || "file",
      size: Number.isFinite(candidate.size) ? candidate.size : 0,
    };
  });
}

function isWindowsConnection(connection: SshStoredConnection): boolean {
  const serverType = connection.serverType ?? optionValue(connection, "serverType");
  return String(serverType || "").toLowerCase() === "windows";
}

function remoteLanguage(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const languages: Record<string, string> = {
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

function remoteDate(value: Date | undefined): string {
  if (!value) return "";
  const pad = (part: number): string => String(part).padStart(2, "0");
  const hours = value.getHours() % 12 || 12;
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(hours)}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function remoteEntryTooltip(entry: Pick<RemoteEntry, "createdAt" | "modifiedAt">): string {
  return [
    entry.createdAt ? `Create Time: ${remoteDate(entry.createdAt)}` : "",
    entry.modifiedAt ? `Modify Time: ${remoteDate(entry.modifiedAt)}` : "",
  ].filter(Boolean).join("\n");
}

export class SshInfoNode extends vscode.TreeItem {
  public constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "info";
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

export class SshFileNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: SshStoredConnection,
    public readonly entry: RemoteEntry,
    protected readonly services: ExtensionServices,
    public readonly parent: SshConnectionNode | SshDirectoryNode,
  ) {
    super(entry.name, vscode.TreeItemCollapsibleState.None);
    this.refreshState();
    this.description = prettyBytes(entry.size);
    this.tooltip = remoteEntryTooltip(entry) || entry.path;
    this.iconPath = targetRemoteFileIcon(this.services.resources, entry.name);
    this.command = {
      command: "mysql.file.open",
      title: "Open File",
      arguments: [this],
    };
  }

  public refreshState(): void {
    const favorite = isFavorite(this.services, this.connection.id, this.entry.path);
    if (path.extname(this.entry.name).toLowerCase() === ".sh") {
      this.contextValue = favorite ? "sshFavoriteFileShell" : "sshFileShell";
    } else {
      this.contextValue = favorite ? "sshFavoriteFile" : "sshFile";
    }
  }

  public async doFavorite(): Promise<void> {
    await toggleFavorite(this.services, this.connection.id, {
      name: this.entry.name,
      path: this.entry.path,
      kind: this.entry.kind,
      size: this.entry.size,
    });
    this.refreshState();
  }

  public async open(): Promise<void> {
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    const data = await session.readFile(this.entry.path);
    const document = await vscode.workspace.openTextDocument({
      content: data.toString("utf8"),
      language: remoteLanguage(this.entry.name),
    });
    const saveSubscription = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() !== document.uri.toString()) {
        return;
      }
      void session.writeFile(this.entry.path, Buffer.from(saved.getText(), "utf8"));
    });
    const closeSubscription = vscode.workspace.onDidCloseTextDocument((closed) => {
      if (closed.uri.toString() === document.uri.toString()) {
        saveSubscription.dispose();
        closeSubscription.dispose();
      }
    });
    await vscode.window.showTextDocument(document);
  }

  public async delete(): Promise<void> {
    if (!(await this.confirm(`Delete remote file ${this.entry.path}?`))) {
      return;
    }
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    await session.remove(this.entry.path);
    this.services.logger.info("Remote file deleted", { path: this.entry.path });
    this.parent.refresh();
  }

  public async rename(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: "New remote file name",
      value: this.entry.name,
    });
    if (!name || name === this.entry.name) return;
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    await session.rename(this.entry.path, `${path.dirname(this.entry.path)}/${name}`);
    this.parent.refresh();
  }

  public async download(): Promise<void> {
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(this.entry.name),
      saveLabel: "Download",
    });
    if (!target) return;
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    await session.download(this.entry.path, target.fsPath);
    void vscode.window.showInformationMessage(`Downloaded ${this.entry.name}.`);
  }

  public async downloadByPath(localPath: string): Promise<void> {
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    await session.download(this.entry.path, localPath);
  }

  public async copyPath(): Promise<void> {
    await vscode.env.clipboard.writeText(this.entry.path);
  }

  private async confirm(message: string): Promise<boolean> {
    return (await vscode.window.showWarningMessage(message, { modal: true }, "Confirm")) === "Confirm";
  }
}

class SshLinkNode extends SshFileNode {
  public constructor(
    connection: SshStoredConnection,
    entry: RemoteEntry,
    services: ExtensionServices,
    parent: SshConnectionNode | SshDirectoryNode,
  ) {
    super(connection, entry, services, parent);
    this.iconPath = new vscode.ThemeIcon("link");
  }

  public override refreshState(): void {
    this.contextValue = isFavorite(this.services, this.connection.id, this.entry.path)
      ? "linkFavorite"
      : "link";
  }
}

export class SshDirectoryNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: SshStoredConnection,
    public readonly remotePath: string,
    private readonly services: ExtensionServices,
    public readonly parent: SshConnectionNode | SshDirectoryNode,
    public readonly entry?: RemoteEntry,
  ) {
    super(
      entry?.name || path.basename(remotePath) || "/",
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.refreshState();
    this.tooltip = remoteEntryTooltip(entry || {}) || remotePath;
    this.iconPath = targetRemoteFolderIcon(
      this.services.resources,
      path.basename(remotePath) || "root",
    );
  }

  public refreshState(): void {
    this.contextValue = isFavorite(this.services, this.connection.id, this.remotePath)
      ? "sshFavoriteFolder"
      : "sshFolder";
  }

  public async doFavorite(): Promise<void> {
    await toggleFavorite(this.services, this.connection.id, {
      name: path.basename(this.remotePath) || "root",
      path: this.remotePath,
      kind: "directory",
      size: 0,
    });
    this.refreshState();
  }

  public async getChildren(): Promise<Array<SshDirectoryNode | SshFileNode | SshLinkNode | SshInfoNode>> {
    return listSshChildren(this.connection, this.remotePath, this.services, this);
  }

  public async newFile(): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: "Remote file name" });
    if (!name) return;
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    await session.writeFile(this.childPath(name), "");
    this.refresh();
  }

  public async newFolder(): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: "Remote folder name" });
    if (!name) return;
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    await session.mkdir(this.childPath(name), true);
    this.refresh();
  }

  public async upload(): Promise<void> {
    const files = await vscode.window.showOpenDialog({ canSelectMany: true, canSelectFolders: false });
    if (!files?.length) return;
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    for (const file of files) {
      await session.upload(file.fsPath, this.childPath(path.basename(file.fsPath)));
    }
    this.refresh();
  }

  public async download(): Promise<void> {
    const target = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false });
    if (!target?.[0]) return;
    const children = await this.getChildren();
    for (const child of children) {
      if (child instanceof SshFileNode) {
        await child.downloadByPath(path.join(target[0].fsPath, String(child.label)));
      }
    }
  }

  public async delete(): Promise<void> {
    if (!(await this.confirm(`Delete remote folder ${this.remotePath}?`))) {
      return;
    }
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    await session.remove(this.remotePath, true);
    this.refresh();
  }

  public async rename(): Promise<void> {
    const currentName = path.basename(this.remotePath);
    const name = await vscode.window.showInputBox({ prompt: "New remote folder name", value: currentName });
    if (!name || name === currentName) return;
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    await session.rename(this.remotePath, `${path.dirname(this.remotePath)}/${name}`);
    this.refresh();
  }

  public async executeShell(command = ""): Promise<void> {
    const source = command || await vscode.window.showInputBox({ prompt: "Remote command" });
    if (!source) return;
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    const result = await session.exec(source);
    const document = await vscode.workspace.openTextDocument({
      content: [result.stdout, result.stderr].filter(Boolean).join("\n"),
      language: "shellscript",
    });
    await vscode.window.showTextDocument(document);
  }

  public async openTerminal(): Promise<void> {
    await this.openTerminalRoute("sshTerminal");
  }

  public async openInTerminal(): Promise<void> {
    await this.openTerminal();
  }

  public async forwardPort(): Promise<void> {
    await this.openTerminalRoute("forward");
  }

  public async copyPath(): Promise<void> {
    await vscode.env.clipboard.writeText(this.remotePath);
  }

  public refresh(): void {
    if (this.parent instanceof SshDirectoryNode) {
      this.parent.refresh();
    } else {
      this.parent.refresh(this);
    }
  }

  private childPath(name: string): string {
    return this.remotePath === "/"
      ? `/${name}`
      : `${this.remotePath.replace(/\/$/, "")}/${name}`;
  }

  private async openTerminalRoute(route: string): Promise<void> {
    await this.services.webviews.createWebviewPanel({
      title: `${displayName(this.connection)} · ${this.remotePath}`,
      type: route,
      route,
      state: { connection: this.connection, path: this.remotePath },
    });
  }

  private async confirm(message: string): Promise<boolean> {
    return (await vscode.window.showWarningMessage(message, { modal: true }, "Confirm")) === "Confirm";
  }
}

async function listSshChildren(
  connection: SshStoredConnection,
  remotePath: string,
  services: ExtensionServices,
  parent: SshConnectionNode | SshDirectoryNode,
): Promise<Array<SshDirectoryNode | SshFileNode | SshLinkNode | SshInfoNode>> {
  const session = await services.ssh.open(asSshOptions(connection));
  const entries = await session.list(remotePath);
  if (entries.length === 0) {
    return [new SshInfoNode("This folder has no files.")];
  }
  const visible = showsHiddenFiles(connection)
    ? entries
    : entries.filter((entry) => !entry.name.startsWith("."));
  const rootPruned = visible.filter((entry) => !shouldPruneSftpRootEntryAtRoot(
    sshOption(connection, "pruneSFTPRoot") === true,
    sshRootPath(connection),
    remotePath,
    entry.path,
    entry.kind,
  ));
  if (rootPruned.length === 0) {
    return [new SshInfoNode("This folder has no files.")];
  }
  const directories = rootPruned
    .filter((entry) => entry.kind === "directory")
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => new SshDirectoryNode(connection, entry.path, services, parent, entry));
  const links = rootPruned
    .filter((entry) => entry.kind === "link")
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => new SshLinkNode(connection, entry, services, parent));
  const files = rootPruned
    .filter((entry) => entry.kind !== "directory" && entry.kind !== "link")
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => new SshFileNode(connection, entry, services, parent));
  return [...directories, ...links, ...files].map((node) => {
    node.refreshState();
    return node;
  });
}

class SshFavoriteItemNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: SshStoredConnection,
    public readonly entry: SshFavoriteEntry,
    private readonly services: ExtensionServices,
    public readonly parent: SshFavoriteNode,
  ) {
    super(entry.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = entry.kind === "directory" ? "sshFavoriteFolder" : "sshFavoriteFile";
    this.description = entry.kind === "directory" ? undefined : prettyBytes(entry.size);
    this.tooltip = entry.path;
    this.iconPath = entry.kind === "directory"
      ? targetRemoteFolderIcon(this.services.resources, entry.name)
      : targetRemoteFileIcon(this.services.resources, entry.name);
    this.command = {
      command: entry.kind === "directory" ? "mysql.ssh.folder.terminal" : "mysql.file.open",
      title: entry.kind === "directory" ? "Open Folder" : "Open File",
      arguments: [this],
    };
  }

  public async open(): Promise<void> {
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    const data = await session.readFile(this.entry.path);
    const document = await vscode.workspace.openTextDocument({
      content: data.toString("utf8"),
      language: remoteLanguage(this.entry.name),
    });
    await vscode.window.showTextDocument(document);
  }

  public async openTerminal(): Promise<void> {
    await this.services.webviews.createWebviewPanel({
      title: `${displayName(this.connection)} · ${this.entry.path}`,
      type: "sshTerminal",
      route: "sshTerminal",
      state: { connection: this.connection, path: this.entry.path },
    });
  }
}

class SshFavoriteNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: SshStoredConnection,
    private readonly services: ExtensionServices,
  ) {
    const presentation = targetRemoteTreePresentations.favorite;
    super(
      presentation.label,
      targetPresentationCollapsibleState(presentation),
    );
    this.contextValue = presentation.contextValue;
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public getChildren(): SshFavoriteItemNode[] {
    return favoriteEntries(this.services, this.connection.id)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => new SshFavoriteItemNode(this.connection, entry, this.services, this));
  }

  public async clear(): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
      "Remove all favorites?",
      { modal: true },
      "Confirm",
    );
    if (confirmed !== "Confirm") return;
    const raw = this.services.state.get<unknown>("favorite_map", {});
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const map = { ...(raw as Record<string, unknown>) };
    map[this.connection.id] = [];
    await this.services.state.update("favorite_map", map);
  }
}

class SshUserNode extends vscode.TreeItem {
  public readonly home: string | undefined;

  public constructor(
    username: string,
    home: string | undefined,
    public readonly shell: string | undefined,
    public readonly connection: SshStoredConnection,
    private readonly services: ExtensionServices,
    public readonly parent: SshUserGroupNode | SshUserSubGroupNode,
  ) {
    super(username, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "sshUser";
    this.iconPath = new vscode.ThemeIcon("person");
    if (shell && !/nologin|false/i.test(shell)) this.description = shell;
    const resolvedHome = home || (isWindowsConnection(connection) ? `C:\\Users\\${username}` : undefined);
    this.home = resolvedHome;
    if (resolvedHome) this.tooltip = `Name: ${username}\nHome: ${resolvedHome}`;
  }

  public async updatePassword(): Promise<void> {
    const password = await vscode.window.showInputBox({
      prompt: `New password for ${String(this.label)}`,
      password: true,
    });
    if (!password) return;
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    const command = isWindowsConnection(this.connection)
      ? `net user ${String(this.label)} ${password}`
      : `printf '%s\\n%s\\n' ${JSON.stringify(password)} ${JSON.stringify(password)} | passwd ${String(this.label)}`;
    await session.exec(command);
    this.parent.refresh();
  }

  public async delete(): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
      `Delete user ${String(this.label)}?`,
      { modal: true },
      "Confirm",
    );
    if (confirmed !== "Confirm") return;
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    await session.exec(isWindowsConnection(this.connection)
      ? `net user ${String(this.label)} /delete`
      : `userdel ${String(this.label)}`);
    this.parent.refresh();
  }

  public async uploadPublicKey(): Promise<void> {
    const key = await vscode.window.showInputBox({ prompt: "Public key content" });
    if (!key || !this.home) return;
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    const directory = isWindowsConnection(this.connection) ? `${this.home}\\.ssh` : `${this.home}/.ssh`;
    await session.exec(isWindowsConnection(this.connection) ? `md ${directory}` : `mkdir -p ${directory}`);
    await session.exec(`printf '%s\\n' ${JSON.stringify(key)} >> ${directory}/authorized_keys`);
  }
}

class SshUserSubGroupNode extends vscode.TreeItem {
  public constructor(
    label: string,
    private readonly users: readonly SshUserNode[],
    private readonly parent: SshUserGroupNode,
    services: ExtensionServices,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = targetResourceTreeIcon(services.resources, "icon/folder.svg");
  }

  public getChildren(): SshUserNode[] {
    return [...this.users].sort((left, right) => String(left.label).localeCompare(String(right.label)));
  }

  public refresh(): void {
    this.parent.refresh();
  }
}

class SshUserGroupNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: SshStoredConnection,
    private readonly services: ExtensionServices,
  ) {
    const presentation = targetRemoteTreePresentations.sshUserGroup;
    super(
      presentation.label,
      targetPresentationCollapsibleState(presentation),
    );
    this.contextValue = presentation.contextValue;
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<Array<SshUserNode | SshUserSubGroupNode | SshInfoNode>> {
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    const result = await session.exec(isWindowsConnection(this.connection)
      ? "net user"
      : "cat /etc/passwd");
    if (result.code && result.code !== 0 && !result.stdout) {
      return [new SshInfoNode(result.stderr || "Unknown error!")];
    }
    const users = isWindowsConnection(this.connection)
      ? result.stdout.split(/\\r?\\n/).map((line) => line.trim()).filter((line) => /^[^\\s]+$/.test(line) && !/^(User|command|DefaultAccount|WDAGUtilityAccount|Guest)$/i.test(line)).map((username) => new SshUserNode(username, undefined, undefined, this.connection, this.services, this))
      : result.stdout.split(/\\r?\\n/).map((line) => line.split(":" )).filter((parts) => parts.length >= 7 && parts[0]).map((parts) => new SshUserNode(parts[0], parts[5], parts[6], this.connection, this.services, this));
    if (isWindowsConnection(this.connection)) {
      return users.sort((left, right) => String(left.label).localeCompare(String(right.label)));
    }
    const grouped = new Map<string, SshUserNode[]>();
    const regular: SshUserNode[] = [];
    for (const user of users) {
      const shell = user.shell || "";
      if (!/nologin|false/i.test(shell)) {
        regular.push(user);
        continue;
      }
      const group = grouped.get(shell) || [];
      group.push(user);
      grouped.set(shell, group);
    }
    const subGroups = [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([shell, members]) => new SshUserSubGroupNode(shell, members, this, this.services));
    return [
      ...subGroups,
      ...regular.sort((left, right) => String(left.label).localeCompare(String(right.label))),
    ];
  }

  public async newUser(): Promise<void> {
    const username = await vscode.window.showInputBox({ prompt: "New user name" });
    if (!username) return;
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    await session.exec(isWindowsConnection(this.connection)
      ? `net user ${username} password /ADD`
      : `useradd ${username}`);
    this.refresh();
  }

  public refresh(): void {
    // The provider owns refresh events; this is the command target boundary.
  }
}

export class SshConnectionNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: SshStoredConnection,
    private readonly services: ExtensionServices,
    private readonly onDelete: (id: string) => Promise<void>,
    public readonly parent?: vscode.TreeItem,
  ) {
    super(displayName(connection), vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = "sshConnection";
    const configuredType = sshOption(connection, "type");
    if (sshOption(connection, "disableSFTP") === true || configuredType === "native") {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
    const configuredHost = sshOption(connection, "host");
    const host = connection.host
      || (typeof configuredHost === "string" && configuredHost.trim() ? configuredHost.trim() : "SSH");
    const port = Number(connection.port ?? sshOption(connection, "port") ?? 22);
    this.tooltip = `${host}:${Number.isInteger(port) ? port : 22}`;
    this.iconPath = connectionTreeIcon(
      this.services.resources,
      connection,
      this.services.activeConnection.get(),
    );
  }

  public async getChildren(): Promise<Array<SshDirectoryNode | SshFileNode | SshLinkNode | SshInfoNode | SshUserGroupNode | SshFavoriteNode>> {
    if (this.connection.disabled) {
      return [new SshInfoNode("Connection is disabled.")];
    }
    const children = await listSshChildren(this.connection, sshRootPath(this.connection), this.services, this);
    if (children.length === 1 && children[0] instanceof SshInfoNode) {
      return children;
    }
    return [
      new SshUserGroupNode(this.connection, this.services),
      new SshFavoriteNode(this.connection, this.services),
      ...children,
    ];
  }

  public async openConnection(): Promise<void> {
    if (isNativeSsh(this.connection)) {
      await this.openTerminal();
      this.services.activeConnection.set(this.connection);
      return;
    }
    await this.services.ssh.open(asSshOptions(this.connection));
    this.services.activeConnection.set(this.connection);
    void vscode.window.showInformationMessage(`Connected to ${displayName(this.connection)}.`);
  }

  public async deleteConnection(): Promise<void> {
    if (!(await this.confirm(`Delete SSH connection ${displayName(this.connection)}?`))) {
      return;
    }
    await this.onDelete(this.connection.id);
  }

  public async copyName(): Promise<void> {
    await vscode.env.clipboard.writeText(displayName(this.connection));
  }

  public async copyIP(): Promise<void> {
    const host = sshOption(this.connection, "host");
    await vscode.env.clipboard.writeText(
      typeof host === "string" ? host : this.connection.host || "",
    );
  }

  public copy(): Promise<void> {
    return this.copyName();
  }

  public async openTerminal(): Promise<void> {
    if (isNativeSsh(this.connection)) {
      const host = this.connection.host || String(sshOption(this.connection, "host") || "");
      if (!host) throw new Error("Native SSH requires a host");
      const username = String(sshOption(this.connection, "username") || this.connection.user || "root");
      const port = Number(this.connection.port ?? sshOption(this.connection, "port") ?? 22);
      const key = sshOption(this.connection, "privateKeyPath");
      const args = [`${username}@${host}`];
      if (Number.isInteger(port) && port > 0 && port !== 22) args.push("-p", String(port));
      if (typeof key === "string" && key.trim()) args.push("-i", expandSshPath(key));
      args.push(
        "-o", "KexAlgorithms=+diffie-hellman-group1-sha1",
        "-o", "StrictHostKeyChecking=no",
      );
      const terminal = vscode.window.createTerminal({
        name: `${displayName(this.connection)} · SSH`,
        shellPath: "ssh",
        shellArgs: args,
      });
      terminal.show();
      return;
    }
    await this.openRoute("sshTerminal", "/");
  }

  public async openInTerminal(): Promise<void> {
    await this.openTerminal();
  }

  public async forwardPort(): Promise<void> {
    if (isNativeSsh(this.connection)) {
      void vscode.window.showErrorMessage("Port forwarding is not supported for native SSH.");
      return;
    }
    await this.openRoute("forward", "/");
  }

  public async fowardPort(): Promise<void> {
    await this.forwardPort();
  }

  public async status(): Promise<void> {
    if (isNativeSsh(this.connection)) {
      void vscode.window.showErrorMessage("SSH status is not supported for native SSH.");
      return;
    }
    await this.openRoute("sshStatus", "/");
  }

  public async monitor(): Promise<void> {
    if (isNativeSsh(this.connection)) {
      void vscode.window.showErrorMessage("SSH monitor is not supported for native SSH.");
      return;
    }
    await this.openRoute("sshMonitor", "/");
  }

  public async startRdp(): Promise<void> {
    await this.openRoute("xterm", "/");
  }

  public async copyKey(): Promise<void> {
    const key = sshOption(this.connection, "privateKeyPath");
    await vscode.env.clipboard.writeText(typeof key === "string" ? key : "");
  }

  public async executeShell(command?: string): Promise<void> {
    const root = new SshDirectoryNode(this.connection, "/", this.services, this);
    await root.executeShell(command);
  }

  public async uploadPublicKey(): Promise<void> {
    const key = await vscode.window.showInputBox({ prompt: "Public key content" });
    if (!key) return;
    const root = new SshDirectoryNode(this.connection, "/", this.services, this);
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    const result = await session.exec(`mkdir -p ~/.ssh && printf '%s\n' ${JSON.stringify(key)} >> ~/.ssh/authorized_keys`);
    if (result.code && result.code !== 0) {
      throw new Error(result.stderr || "Unable to upload SSH public key");
    }
    root.refresh();
  }

  public async newUser(): Promise<void> {
    await this.executeShell("sudo adduser new_user");
  }

  public async deleteUser(): Promise<void> {
    await this.executeShell("sudo userdel user_name");
  }

  public async updatePassword(): Promise<void> {
    await this.executeShell("sudo passwd user_name");
  }

  public async newFile(): Promise<void> {
    await new SshDirectoryNode(this.connection, "/", this.services, this).newFile();
  }

  public async newFolder(): Promise<void> {
    await new SshDirectoryNode(this.connection, "/", this.services, this).newFolder();
  }

  public async upload(): Promise<void> {
    await new SshDirectoryNode(this.connection, "/", this.services, this).upload();
  }

  public async connect(): Promise<void> {
    await this.openConnection();
  }

  private async openRoute(route: string, remotePath: string): Promise<void> {
    const state = {
      target: this.connection,
      connection: this.connection,
      path: remotePath,
    };
    await this.services.webviews.createWebviewPanel({
      title: `${displayName(this.connection)} · ${route}`,
      type: route,
      route,
      state,
      eventHandler: (handler) => {
        registerWebviewUtilityProtocols({
          route,
          target: this.connection,
          state,
          webviewState: state,
          services: this.services,
          handler,
        });
      },
    });
  }

  private async confirm(message: string): Promise<boolean> {
    return (await vscode.window.showWarningMessage(message, { modal: true }, "Confirm")) === "Confirm";
  }

  public refresh(_element?: vscode.TreeItem): void {
    // The provider owns refresh events; this method is intentionally a safe command target.
  }
}

export class SshTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changes = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  public readonly onDidChangeTreeData = this.changes.event;

  public constructor(private readonly services: ExtensionServices) {}

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getParent(element: vscode.TreeItem): vscode.TreeItem | undefined {
    return "parent" in element
      ? (element as vscode.TreeItem & { parent?: vscode.TreeItem }).parent
      : undefined;
  }

  public getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (element && "getChildren" in element && typeof element.getChildren === "function") {
      return Promise.resolve(element.getChildren() as Promise<vscode.TreeItem[]>);
    }
    const raw = this.services.state.get<unknown>("nosql.connections", {});
    const connections = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object"
        ? Object.entries(raw as Record<string, SshStoredConnection>).map(([id, value]) => ({ ...value, id: value.id || id }))
        : [];
    return Promise.resolve(
      connections
        .filter((value): value is SshStoredConnection => Boolean(value && typeof value === "object" && (value as SshStoredConnection).type && ["SSH", "SFTP"].includes((value as SshStoredConnection).type)))
        .map((connection) => new SshConnectionNode(connection, this.services, async (id) => this.remove(id))),
    );
  }

  public refresh(element?: vscode.TreeItem): void {
    this.changes.fire(element);
  }

  public dispose(): void {
    this.changes.dispose();
  }

  private async remove(id: string): Promise<void> {
    const raw = this.services.state.get<unknown>("nosql.connections", {});
    if (Array.isArray(raw)) {
      await this.services.state.update(
        "nosql.connections",
        raw.filter((value) => (value as SshStoredConnection)?.id !== id),
      );
    } else if (raw && typeof raw === "object") {
      const next = { ...(raw as Record<string, unknown>) };
      delete next[id];
      await this.services.state.update("nosql.connections", next);
    }
    await this.services.ssh.close(id);
    this.refresh();
  }
}
