import * as path from "node:path";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions } from "../database/types";
import type { RemoteEntry, SshConnectionOptions } from "./sshService";

export interface SshStoredConnection extends ConnectionOptions {
  readonly name?: string;
  readonly disabled?: boolean;
  readonly [key: string]: unknown;
}

function displayName(connection: SshStoredConnection): string {
  return connection.name || connection.id || connection.host || "SSH";
}

function asSshOptions(connection: SshStoredConnection): SshConnectionOptions {
  return connection as SshConnectionOptions;
}

function optionValue(connection: SshStoredConnection, key: string): unknown {
  return connection.options?.[key];
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
    private readonly services: ExtensionServices,
    public readonly parent: SshDirectoryNode,
  ) {
    super(entry.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "sshFile";
    this.description = `${entry.size} bytes`;
    this.tooltip = entry.path;
    this.iconPath = new vscode.ThemeIcon("file");
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

export class SshDirectoryNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: SshStoredConnection,
    public readonly remotePath: string,
    private readonly services: ExtensionServices,
    public readonly parent: SshConnectionNode | SshDirectoryNode,
  ) {
    super(
      path.basename(remotePath) || "/",
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.contextValue = "sshFolder";
    this.tooltip = remotePath;
    this.iconPath = new vscode.ThemeIcon("folder");
  }

  public async getChildren(): Promise<Array<SshDirectoryNode | SshFileNode | SshInfoNode>> {
    const session = await this.services.ssh.open(asSshOptions(this.connection));
    const entries = await session.list(this.remotePath);
    if (entries.length === 0) {
      return [new SshInfoNode("There are no files in this folder.")];
    }
    const visible = entries.filter((entry) => !entry.name.startsWith("."));
    const directories = visible
      .filter((entry) => entry.kind === "directory")
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(
        (entry) =>
          new SshDirectoryNode(
            this.connection,
            entry.path,
            this.services,
            this,
          ),
      );
    const files = visible
      .filter((entry) => entry.kind !== "directory")
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => new SshFileNode(this.connection, entry, this.services, this));
    return [...directories, ...files];
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

export class SshConnectionNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: SshStoredConnection,
    private readonly services: ExtensionServices,
    private readonly onDelete: (id: string) => Promise<void>,
    public readonly parent?: vscode.TreeItem,
  ) {
    super(displayName(connection), vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = "sshConnection";
    this.description = connection.host ? `${connection.user || "root"}@${connection.host}` : "SSH";
    this.iconPath = new vscode.ThemeIcon("remote");
  }

  public async getChildren(): Promise<Array<SshDirectoryNode | SshFileNode | SshInfoNode>> {
    if (this.connection.disabled) {
      return [new SshInfoNode("Connection is disabled.")];
    }
    await this.services.ssh.open(asSshOptions(this.connection));
    return [new SshDirectoryNode(this.connection, "/", this.services, this)];
  }

  public async openConnection(): Promise<void> {
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
    await vscode.env.clipboard.writeText(this.connection.host || "");
  }

  public copy(): Promise<void> {
    return this.copyName();
  }

  public async openTerminal(): Promise<void> {
    await this.openRoute("sshTerminal", "/");
  }

  public async openInTerminal(): Promise<void> {
    await this.openTerminal();
  }

  public async forwardPort(): Promise<void> {
    await this.openRoute("forward", "/");
  }

  public async fowardPort(): Promise<void> {
    await this.forwardPort();
  }

  public async status(): Promise<void> {
    await this.openRoute("sshStatus", "/");
  }

  public async monitor(): Promise<void> {
    await this.openRoute("sshMonitor", "/");
  }

  public async startRdp(): Promise<void> {
    await this.openRoute("xterm", "/");
  }

  public async copyKey(): Promise<void> {
    const key = optionValue(this.connection, "privateKeyPath");
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
    await this.services.webviews.createWebviewPanel({
      title: `${displayName(this.connection)} · ${route}`,
      type: route,
      route,
      state: { connection: this.connection, path: remotePath },
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
    const raw = this.services.state.get<unknown>("redis.connections", {});
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
    const raw = this.services.state.get<unknown>("redis.connections", {});
    if (Array.isArray(raw)) {
      await this.services.state.update(
        "redis.connections",
        raw.filter((value) => (value as SshStoredConnection)?.id !== id),
      );
    } else if (raw && typeof raw === "object") {
      const next = { ...(raw as Record<string, unknown>) };
      delete next[id];
      await this.services.state.update("redis.connections", next);
    }
    await this.services.ssh.close(id);
    this.refresh();
  }
}
