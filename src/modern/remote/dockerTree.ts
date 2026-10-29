import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

import * as vscode from "vscode";

import { registerWebviewUtilityProtocols } from "../commands/webviewUtilityProtocols";
import type { ExtensionServices } from "../core/extensionServices";
import type { TypedWebviewHandler } from "../core/webviewHandler";
import { prettyBytes } from "../core/utilityService";
import type { ConnectionOptions, QueryResult } from "../database/types";
import {
  connectionTreeIcon,
  targetRemoteFileIcon,
  targetResourceTreeIcon,
  targetPresentationCollapsibleState,
  targetThemePresentationIcon,
} from "../tree/targetTreeIcon";
import { targetRemoteTreePresentations } from "../tree/targetTreePresentation";

interface DockerConnection extends ConnectionOptions {
  readonly name?: string;
  readonly disabled?: boolean;
  readonly [key: string]: unknown;
}

type DockerResourceKind = "container" | "image" | "network" | "volume";

function nameOf(connection: DockerConnection): string {
  return connection.name || connection.id || connection.host || "Docker";
}

function rowValue(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
    const matching = Object.keys(row).find((key) => key.toLowerCase() === name.toLowerCase());
    if (matching) return row[matching];
  }
  return undefined;
}

function rowText(row: Record<string, unknown>, ...names: string[]): string {
  const value = rowValue(row, ...names);
  return value == null ? "" : String(value);
}

function resultRows(result: QueryResult<Record<string, unknown>>): Record<string, unknown>[] {
  return Array.isArray(result.rows) ? result.rows : [];
}

async function executeDockerContainer(
  connection: DockerConnection,
  services: ExtensionServices,
  containerId: string,
  command: readonly string[],
): Promise<string> {
  const result = await services.connections.query<Record<string, unknown>>(
    connection,
    `EXEC /containers/${encodeURIComponent(containerId)}\n${JSON.stringify(command)}`,
  );
  return rowText(resultRows(result)[0] || {}, "output");
}

function childContainerPath(parent: string, name: string): string {
  const normalizedParent = parent === "/" ? "" : parent.replace(/\/+$/, "");
  const normalizedName = name.replace(/^\/+/, "");
  return `${normalizedParent}/${normalizedName}`.replace(/\/+/g, "/") || "/";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function writeDockerFile(
  connection: DockerConnection,
  services: ExtensionServices,
  containerId: string,
  remotePath: string,
  content: Buffer,
): Promise<void> {
  const encoded = content.toString("base64");
  await executeDockerContainer(connection, services, containerId, [
    "sh",
    "-c",
    `printf '%s' ${shellQuote(encoded)} | base64 -d > ${shellQuote(remotePath)}`,
  ]);
}

async function readDockerFile(
  connection: DockerConnection,
  services: ExtensionServices,
  containerId: string,
  remotePath: string,
): Promise<Buffer> {
  const encoded = (await executeDockerContainer(
    connection,
    services,
    containerId,
    ["base64", remotePath],
  )).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error(`Docker did not return readable file data for ${remotePath}`);
  }
  return Buffer.from(encoded, "base64");
}

function registerDockerTerminal(
  handler: TypedWebviewHandler,
  connection: DockerConnection,
  services: ExtensionServices,
  containerId: string,
  remotePath: string,
): void {
  let input = "";
  const prompt = `${remotePath || "/"} # `;
  handler.on("terminalConfig", async () => {
    await handler.send("terminalConfig", { dbType: "Docker" });
  });
  handler.on("initTerminal", async () => {
    await handler.send("ready", { connection: nameOf(connection) });
    await handler.send("data", prompt);
  });
  handler.on("data", async (content) => {
    const value = typeof content === "string"
      ? content
      : content && typeof content === "object" && "data" in content
        ? String((content as { data?: unknown }).data ?? "")
        : String(content ?? "");
    for (const character of value) {
      if (character !== "\r" && character !== "\n") {
        if (character === "\u007f") input = input.slice(0, -1);
        else input += character;
        continue;
      }
      const command = input.trim();
      input = "";
      if (!command) {
        await handler.send("data", `\r\n${prompt}`);
        continue;
      }
      try {
        const output = await executeDockerContainer(connection, services, containerId, [
          "sh",
          "-c",
          `cd ${shellQuote(remotePath || "/")} && ${command}`,
        ]);
        await handler.send("data", `\r\n${output}${output.endsWith("\n") ? "" : "\r\n"}${prompt}`);
      } catch (error) {
        await handler.send("error", error instanceof Error ? error.message : String(error));
        await handler.send("data", `\r\n${prompt}`);
      }
    }
  });
}

function imageReference(meta: Record<string, unknown>): string {
  const tags = rowValue(meta, "RepoTags");
  if (Array.isArray(tags) && typeof tags[0] === "string" && tags[0]) return tags[0];
  const digests = rowValue(meta, "RepoDigests");
  if (Array.isArray(digests) && typeof digests[0] === "string" && digests[0]) {
    return digests[0].split("@")[0] || digests[0];
  }
  return rowText(meta, "Id", "ID");
}

function imageNameAndVersion(meta: Record<string, unknown>): { name: string; version: string } {
  const reference = imageReference(meta);
  const slash = reference.lastIndexOf("/");
  const colon = reference.lastIndexOf(":");
  if (colon > slash) {
    return {
      name: reference.slice(0, colon) || "<none>",
      version: reference.slice(colon + 1) || "<none>",
    };
  }
  return { name: reference || "<none>", version: "<none>" };
}

function cleanImageName(value: string): string {
  return value.replace(/^(docker\.io\/|sha256:)/, "");
}

function dockerDate(value: unknown, unixSeconds = false): string {
  if (value == null || value === "") return "";
  const date = typeof value === "number" || unixSeconds
    ? new Date(Number(value) * (unixSeconds ? 1000 : 1))
    : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (part: number): string => String(part).padStart(2, "0");
  const hours = date.getHours() % 12 || 12;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(hours)}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function dockerPorts(meta: Record<string, unknown>): Record<string, unknown>[] {
  const ports = rowValue(meta, "Ports");
  if (!Array.isArray(ports)) return [];
  const seen = new Set<string>();
  return ports
    .map(objectValue)
    .filter((port): port is Record<string, unknown> => port !== undefined)
    .filter((port) => {
      const publicPort = rowValue(port, "PublicPort");
      const ip = rowText(port, "IP");
      if (publicPort == null || !ip) return true;
      const key = `${ip.replace(/(0\.0\.0\.0|::)/, "")}${String(publicPort)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function dockerContainerTooltip(label: string, meta: Record<string, unknown>): vscode.MarkdownString {
  const shortId = rowText(meta, "Id", "ID").slice(0, 12);
  const sections = [`#### ${label} (${shortId})`];
  const ports = dockerPorts(meta);
  if (ports.length) {
    sections.push(
      "---\n**Ports**:\n\n"
      + ports.map((port) => {
        const ip = rowText(port, "IP");
        const publicPort = rowText(port, "PublicPort");
        const privatePort = rowText(port, "PrivatePort");
        const type = rowText(port, "Type");
        return `${ip ? `${ip}:${publicPort} ➜ ` : "- "}${privatePort}/${type}`;
      }).join("\n\n"),
    );
  }
  const mounts = rowValue(meta, "Mounts");
  if (Array.isArray(mounts)) {
    const mountLines = mounts
      .map(objectValue)
      .filter((mount): mount is Record<string, unknown> => mount !== undefined)
      .map((mount) => `- ${rowText(mount, "Source", "Name")} ➜ ${rowText(mount, "Destination")}`);
    if (mountLines.length) sections.push("---\n**Volumes**:\n\n" + mountLines.join("\n\n"));
  }
  return new vscode.MarkdownString(sections.join("\n"));
}

interface DockerContainerEntry {
  readonly name: string;
  readonly size: number;
  readonly date: string;
  readonly directory: boolean;
}

function parseContainerEntries(output: string): DockerContainerEntry[] {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line): DockerContainerEntry | undefined => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 9) return undefined;
      const name = parts.slice(8).join(" ");
      if (!name) return undefined;
      const size = Number.parseInt(parts[4] || "0", 10);
      return {
        name,
        size: Number.isFinite(size) ? size : 0,
        date: `${parts[6] || ""} ${(parts[7] || "").slice(0, 8)}`.trim(),
        directory: (parts[0] || "").startsWith("d"),
      };
    })
    .filter((entry): entry is DockerContainerEntry => entry !== undefined)
    .sort((left, right) => {
      if (left.directory !== right.directory) return left.directory ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

async function openResult(
  services: ExtensionServices,
  title: string,
  sql: string,
  result: QueryResult<Record<string, unknown>>,
): Promise<void> {
  await services.webviews.createWebviewPanel({
    title,
    type: "result",
    route: "result",
    state: { sql, rows: result.rows, fields: result.fields, affectedRows: result.affectedRows },
  });
}

class DockerTreeItem extends vscode.TreeItem {
  public constructor(
    label: string,
    contextValue: string,
    collapsibleState = vscode.TreeItemCollapsibleState.None,
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
  }
}

class DockerInfoNode extends DockerTreeItem {
  public constructor(message: string) {
    super(message, "info", vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

type DockerContainerParent = DockerResourceNode | DockerContainerEntryNode;

async function listDockerContainerEntries(
  connection: DockerConnection,
  services: ExtensionServices,
  containerId: string,
  remotePath: string,
  parent: DockerContainerParent,
): Promise<Array<DockerContainerEntryNode | DockerInfoNode>> {
  const output = await executeDockerContainer(connection, services, containerId, [
    "ls",
    "-Aln",
    "--full-time",
    "--",
    remotePath,
  ]);
  const entries = parseContainerEntries(output);
  if (!entries.length) return [new DockerInfoNode("This folder has no files.")];
  return entries.map((entry) => new DockerContainerEntryNode(
    connection,
    services,
    containerId,
    entry,
    remotePath,
    parent,
  ));
}

class DockerContainerEntryNode extends DockerTreeItem {
  public constructor(
    private readonly connection: DockerConnection,
    private readonly services: ExtensionServices,
    private readonly containerId: string,
    private readonly entry: DockerContainerEntry,
    private readonly prefix: string,
    public readonly parent: DockerContainerParent,
  ) {
    super(
      entry.name,
      entry.directory ? "dockerFolder" : "file",
      entry.directory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.description = entry.directory ? undefined : prettyBytes(entry.size);
    this.tooltip = entry.directory
      ? prefix === "/" ? entry.date : undefined
      : `Create time: ${entry.date}`;
    this.iconPath = entry.directory
      ? targetResourceTreeIcon(this.services.resources, "icon/folder.svg")
      : targetRemoteFileIcon(this.services.resources, entry.name);
    if (!entry.directory) {
      this.command = {
        command: "mysql.file.open",
        title: "Open File",
        arguments: [this],
      };
    }
  }

  public async getChildren(): Promise<Array<DockerContainerEntryNode | DockerInfoNode>> {
    if (!this.entry.directory) return [];
    return listDockerContainerEntries(
      this.connection,
      this.services,
      this.containerId,
      this.fullPath(),
      this,
    );
  }

  public async open(): Promise<void> {
    if (this.entry.directory) return;
    const content = await executeDockerContainer(this.connection, this.services, this.containerId, [
      "cat",
      "--",
      this.fullPath(),
    ]);
    const document = await vscode.workspace.openTextDocument({
      content,
      language: "plaintext",
    });
    await vscode.window.showTextDocument(document);
  }

  public async copyPath(): Promise<void> {
    await vscode.env.clipboard.writeText(this.fullPath());
  }

  public async newFile(): Promise<void> {
    if (!this.entry.directory) return;
    const name = (await vscode.window.showInputBox({ title: "Create new file" }))?.trim();
    if (!name) return;
    await executeDockerContainer(this.connection, this.services, this.containerId, [
      "touch",
      childContainerPath(this.fullPath(), name),
    ]);
    this.parent.refresh();
  }

  public async newFolder(): Promise<void> {
    if (!this.entry.directory) return;
    const name = (await vscode.window.showInputBox({ title: "Create new folder" }))?.trim();
    if (!name) return;
    await executeDockerContainer(this.connection, this.services, this.containerId, [
      "mkdir",
      "-p",
      childContainerPath(this.fullPath(), name),
    ]);
    this.parent.refresh();
  }

  public async upload(): Promise<void> {
    if (!this.entry.directory) return;
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: true,
      canSelectMany: true,
    });
    if (!selected?.length) return;
    for (const uri of selected) {
      const stat = await vscode.workspace.fs.stat(uri);
      if ((stat.type & vscode.FileType.Directory) !== 0) {
        const files = await vscode.workspace.findFiles(new vscode.RelativePattern(uri, "**/*"));
        for (const file of files) {
          const relative = path.relative(uri.fsPath, file.fsPath).split(path.sep).join("/");
          const remotePath = childContainerPath(this.fullPath(), relative);
          await executeDockerContainer(this.connection, this.services, this.containerId, [
            "mkdir",
            "-p",
            path.posix.dirname(remotePath),
          ]);
          await writeDockerFile(
            this.connection,
            this.services,
            this.containerId,
            remotePath,
            await readFile(file.fsPath),
          );
        }
      } else {
        const remotePath = childContainerPath(this.fullPath(), path.basename(uri.fsPath));
        await writeDockerFile(
          this.connection,
          this.services,
          this.containerId,
          remotePath,
          await readFile(uri.fsPath),
        );
      }
    }
    this.parent.refresh();
  }

  public async download(): Promise<void> {
    if (this.entry.directory) {
      const target = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
      });
      if (!target?.[0]) return;
      await this.downloadTo(path.join(target[0].fsPath, this.entry.name));
    } else {
      const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(this.entry.name),
        saveLabel: "Download",
      });
      if (!target) return;
      await this.downloadTo(target.fsPath);
    }
    void vscode.window.showInformationMessage(`Downloaded ${this.entry.name}.`);
  }

  public async rename(): Promise<void> {
    const name = (await vscode.window.showInputBox({
      title: "Change file name",
      value: this.entry.name,
    }))?.trim();
    if (!name || name === this.entry.name) return;
    await executeDockerContainer(this.connection, this.services, this.containerId, [
      "mv",
      this.fullPath(),
      childContainerPath(this.prefix, name),
    ]);
    this.parent.refresh();
  }

  public async delete(): Promise<void> {
    const kind = this.entry.directory ? "folder" : "file";
    const confirmed = await vscode.window.showWarningMessage(
      `Delete Docker ${kind} ${this.entry.name}?`,
      { modal: true },
      "Confirm",
    );
    if (confirmed !== "Confirm") return;
    await executeDockerContainer(this.connection, this.services, this.containerId, [
      "rm",
      ...(this.entry.directory ? ["-rf"] : ["-f"]),
      this.fullPath(),
    ]);
    this.parent.refresh();
  }

  public async openTerminal(): Promise<void> {
    const remotePath = this.entry.directory ? this.fullPath() : this.prefix;
    const state = {
      target: this.connection,
      connection: this.connection,
      container: this.containerId,
      path: remotePath,
    };
    await this.services.webviews.createWebviewPanel({
      title: `${this.entry.name} · terminal`,
      type: "xterm",
      route: "xterm",
      state,
      eventHandler: (handler) => registerDockerTerminal(
        handler,
        this.connection,
        this.services,
        this.containerId,
        remotePath,
      ),
    });
  }

  public refresh(): void {
    this.parent.refresh();
  }

  private async downloadTo(localPath: string): Promise<void> {
    if (this.entry.directory) {
      await mkdir(localPath, { recursive: true });
      for (const child of await this.getChildren()) {
        if (child instanceof DockerContainerEntryNode) {
          await child.downloadTo(path.join(localPath, child.entry.name));
        }
      }
      return;
    }
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(
      localPath,
      await readDockerFile(this.connection, this.services, this.containerId, this.fullPath()),
    );
  }

  private fullPath(): string {
    const base = this.prefix.endsWith("/") ? this.prefix : `${this.prefix}/`;
    return `${base}${this.entry.name}`.replace(/\/+/g, "/");
  }
}

export class DockerConnectionNode extends DockerTreeItem {
  public constructor(
    public readonly connection: DockerConnection,
    private readonly services: ExtensionServices,
    private readonly onDelete: (id: string) => Promise<void>,
    private readonly onRefresh: () => void = () => undefined,
    public readonly parent?: vscode.TreeItem,
  ) {
    super(nameOf(connection), "dockerConnection", vscode.TreeItemCollapsibleState.Collapsed);
    this.description = connection.connectionUrl || connection.socketPath || "Docker";
    this.iconPath = connectionTreeIcon(
      this.services.resources,
      connection,
      this.services.activeConnection.get(),
    );
  }

  public async getChildren(): Promise<DockerTreeItem[]> {
    if (this.connection.disabled) return [new DockerTreeItem("Connection is disabled.", "info")];
    await this.services.connections.getConnection(this.connection);
    return [
      new DockerGroupNode("Containers", "container", "/containers/json?all=1", this.connection, this.services, this, this.onRefresh),
      new DockerGroupNode("Images", "image", "/images/json", this.connection, this.services, this, this.onRefresh),
      new DockerGroupNode("Networks", "network", "/networks", this.connection, this.services, this, this.onRefresh),
      new DockerGroupNode("Volumes", "volume", "/volumes", this.connection, this.services, this, this.onRefresh),
    ];
  }

  public async openConnection(): Promise<void> {
    await this.services.connections.getConnection(this.connection);
    this.services.activeConnection.set(this.connection);
    void vscode.window.showInformationMessage(`Connected to ${nameOf(this.connection)}.`);
  }

  public async deleteConnection(): Promise<void> {
    if (await this.confirm(`Delete Docker connection ${nameOf(this.connection)}?`)) {
      await this.onDelete(this.connection.id);
    }
  }

  public async copyName(): Promise<void> {
    await vscode.env.clipboard.writeText(nameOf(this.connection));
  }

  public async copy(): Promise<void> {
    await this.copyName();
  }

  public async showStats(): Promise<void> {
    const result = await this.query("GET /containers/json?all=1");
    await openResult(this.services, "Docker containers", "GET /containers/json?all=1", result);
  }

  public async newComposeTemplate(): Promise<string> {
    const source = "services:\n  app:\n    image: nginx:latest\n    ports:\n      - \"8080:80\"\n";
    const document = await vscode.workspace.openTextDocument({ content: source, language: "yaml" });
    await vscode.window.showTextDocument(document);
    return source;
  }

  public async openTerminal(): Promise<void> {
    const state = { target: this.connection, connection: this.connection };
    await this.services.webviews.createWebviewPanel({
      title: `${nameOf(this.connection)} · terminal`,
      type: "xterm",
      route: "xterm",
      state,
      eventHandler: (handler) => {
        registerWebviewUtilityProtocols({
          route: "xterm",
          target: this.connection,
          state,
          webviewState: state,
          services: this.services,
          handler,
        });
      },
    });
  }

  private async query(source: string): Promise<QueryResult<Record<string, unknown>>> {
    return this.services.connections.query(this.connection, source);
  }

  private async confirm(message: string): Promise<boolean> {
    return (await vscode.window.showWarningMessage(message, { modal: true }, "Confirm")) === "Confirm";
  }
}

class DockerGroupNode extends DockerTreeItem {
  public constructor(
    label: string,
    private readonly kind: DockerResourceKind,
    private readonly listPath: string,
    private readonly connection: DockerConnection,
    private readonly services: ExtensionServices,
    public readonly parent: DockerConnectionNode,
    private readonly onRefresh: () => void,
  ) {
    const presentation = kind === "container"
      ? targetRemoteTreePresentations.dockerContainerGroup
      : kind === "image"
        ? targetRemoteTreePresentations.dockerImageGroup
        : kind === "network"
          ? targetRemoteTreePresentations.dockerNetworkGroup
          : targetRemoteTreePresentations.dockerVolumeGroup;
    super(
      label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<Array<DockerResourceNode | DockerComposeProjectNode>> {
    const result = await this.services.connections.query<Record<string, unknown>>(this.connection, `GET ${this.listPath}`);
    const rows = resultRows(result);
    if (this.kind === "image") return this.buildImageNodes(rows);
    if (this.kind !== "container") {
      return rows
        .map((row) => new DockerResourceNode(this.kind, row, this.connection, this.services, this))
        .sort((left, right) => String(left.label).localeCompare(String(right.label)));
    }
    const projects = new Map<string, Record<string, unknown>[]>();
    const ungrouped: Record<string, unknown>[] = [];
    for (const row of rows) {
      const labels = rowValue(row, "Labels");
      const project = labels && typeof labels === "object" && !Array.isArray(labels)
        ? rowText(labels as Record<string, unknown>, "com.docker.compose.project")
        : "";
      if (!project) {
        ungrouped.push(row);
        continue;
      }
      const projectRows = projects.get(project) || [];
      projectRows.push(row);
      projects.set(project, projectRows);
    }
    const children = [
      ...[...projects.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
        ([project, projectRows]) => new DockerComposeProjectNode(
          project,
          projectRows,
          this.connection,
          this.services,
          this,
        ),
      ),
      ...ungrouped.map((row) => new DockerResourceNode(this.kind, row, this.connection, this.services, this)),
    ];
    return children.sort((left, right) => {
      const leftProject = left instanceof DockerComposeProjectNode;
      const rightProject = right instanceof DockerComposeProjectNode;
      if (leftProject !== rightProject) return leftProject ? -1 : 1;
      if (leftProject && rightProject) return String(left.label).localeCompare(String(right.label));
      const stateRank = (item: DockerResourceNode | DockerComposeProjectNode): number => {
        if (!(item instanceof DockerResourceNode)) return 0;
        return item.contextValue === "dockerContainerRunning"
          ? 0
          : item.contextValue === "dockerContainerPaused" ? 1 : 2;
      };
      const rankDifference = stateRank(left) - stateRank(right);
      return rankDifference || String(left.label).localeCompare(String(right.label));
    });
  }

  private buildImageNodes(rows: Record<string, unknown>[]): DockerResourceNode[] {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const { name } = imageNameAndVersion(row);
      const imageRows = groups.get(name) || [];
      imageRows.push(row);
      groups.set(name, imageRows);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, imageRows]) => {
        const first = imageRows[0];
        const node = new DockerResourceNode(
          "image",
          first,
          this.connection,
          this.services,
          this,
          { label: name },
        );
        if (imageRows.length > 1) {
          for (const row of imageRows) {
            node.addImageVersion(new DockerResourceNode(
              "image",
              row,
              this.connection,
              this.services,
              node,
              { label: imageNameAndVersion(row).version, imageVersion: true },
            ));
          }
        }
        return node;
      });
  }

  public async newContainer(): Promise<string> {
    return this.template("POST /containers/create\n{\n  \"Image\": \"nginx:latest\"\n}", "json");
  }

  public async newImage(): Promise<string> {
    return this.template("POST /images/create?fromImage=nginx:latest", "http");
  }

  public async newNetwork(): Promise<string> {
    return this.template("POST /networks/create\n{\n  \"Name\": \"network-name\"\n}", "json");
  }

  public async newVolume(): Promise<string> {
    return this.template("POST /volumes/create\n{\n  \"Name\": \"volume-name\"\n}", "json");
  }

  public async cleanUp(): Promise<void> {
    const children = await this.getChildren();
    for (const child of children) {
      await child.cleanUp();
    }
  }

  public refresh(): void {
    this.onRefresh();
  }

  private async template(content: string, language: string): Promise<string> {
    const document = await vscode.workspace.openTextDocument({ content, language });
    await vscode.window.showTextDocument(document);
    return content;
  }
}

class DockerComposeProjectNode extends DockerTreeItem {
  private readonly children: DockerResourceNode[];

  public constructor(
    project: string,
    rows: readonly Record<string, unknown>[],
    connection: DockerConnection,
    services: ExtensionServices,
    public readonly parent: DockerGroupNode,
  ) {
    const presentation = targetRemoteTreePresentations.dockerComposeProject;
    super(
      project,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
    this.children = rows.map(
      (row) => new DockerResourceNode("container", row, connection, services, this),
    );
  }

  public getChildren(): DockerResourceNode[] {
    return this.children;
  }

  public async cleanUp(): Promise<void> {
    for (const child of this.children) {
      await child.cleanUp();
    }
  }

  public refresh(): void {
    this.parent.refresh();
  }
}

export class DockerResourceNode extends DockerTreeItem {
  private readonly identifier: string;
  private readonly imageVersions: DockerResourceNode[] = [];
  private readonly imageVersion: boolean;

  public constructor(
    private readonly kind: DockerResourceKind,
    public readonly meta: Record<string, unknown>,
    private readonly connection: DockerConnection,
    private readonly services: ExtensionServices,
    public readonly parent: DockerGroupNode | DockerComposeProjectNode | DockerResourceNode,
    options: { readonly label?: string; readonly imageVersion?: boolean } = {},
  ) {
    super(
      options.label || DockerResourceNode.displayName(kind, meta),
      DockerResourceNode.contextValue(kind, meta),
      kind === "container" && DockerResourceNode.isRunning(meta)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.imageVersion = options.imageVersion === true;
    this.identifier = rowText(meta, "Id", "ID", "Name", "name");
    const created = kind === "image"
      ? dockerDate(rowValue(meta, "Created"), true)
      : dockerDate(rowValue(meta, "Created"));
    if (kind === "container") {
      this.description = cleanImageName(rowText(meta, "Image"));
      this.tooltip = dockerContainerTooltip(String(this.label), meta);
    } else if (kind === "image") {
      this.description = [prettyBytes(rowValue(meta, "Size")), created].filter(Boolean).join(", ");
      this.tooltip = `name: ${imageReference(meta)}\ntime: ${created}`;
    } else if (kind === "network") {
      const ipam = objectValue(rowValue(meta, "IPAM"));
      const configs = rowValue(ipam || {}, "Config");
      this.tooltip = `Create Time: ${created}`;
      if (Array.isArray(configs) && configs.length) {
        const subnetLines = configs
          .map(objectValue)
          .filter((config): config is Record<string, unknown> => config !== undefined)
          .map((config) => `subnet: ${rowText(config, "Subnet")} gateway: ${rowText(config, "Gateway")}`);
        this.description = rowText(objectValue(configs[0]) || {}, "Subnet");
        this.tooltip = `${this.tooltip}\nIPAN driver:${rowText(ipam || {}, "Driver")}\n${subnetLines.join("\n")}`;
      }
    } else {
      this.tooltip = `Location: ${rowText(meta, "Mountpoint")}`;
    }
    const state = rowText(meta, "State").toLocaleLowerCase();
    if (kind === "container" && state === "restarting") {
      this.tooltip = "Restarting...";
    }
    this.iconPath = this.imageVersion
      ? new vscode.ThemeIcon("bookmark")
      : kind === "image"
        ? new vscode.ThemeIcon("package")
      : kind === "network"
        ? new vscode.ThemeIcon("globe")
        : kind === "volume"
          ? new vscode.ThemeIcon("archive")
          : state === "running" || state === "restarting"
            ? new vscode.ThemeIcon(
              state === "restarting" ? "debug-restart" : "play",
              new vscode.ThemeColor(state === "restarting" ? "charts.yellow" : "charts.green"),
            )
            : state === "paused"
              ? new vscode.ThemeIcon("debug-pause")
              : new vscode.ThemeIcon("debug-stop", new vscode.ThemeColor("charts.red"));
    if (this.imageVersion) {
      this.command = {
        command: "mysql.docker.image.inspect",
        title: "Inspect Image",
        arguments: [this, true],
      };
    } else if (kind === "container") {
      this.command = {
        command: "mysql.docker.container.showLogs",
        title: "Show logs",
        arguments: [this],
      };
    } else if (kind === "image") {
      this.command = {
        command: "mysql.docker.image.inspect",
        title: "Inspect Image",
        arguments: [this, true],
      };
    } else if (kind === "network") {
      this.command = {
        command: "mysql.docker.network.inspect",
        title: "Inspect Network",
        arguments: [this, true],
      };
    } else {
      this.command = {
        command: "mysql.docker.volume.inspect",
        title: "Inspect Volume",
        arguments: [this, true],
      };
    }
  }

  public static isRunning(meta: Record<string, unknown>): boolean {
    const state = rowText(meta, "State").toLowerCase();
    return state === "running" || state === "restarting";
  }

  public addImageVersion(child: DockerResourceNode): void {
    this.imageVersions.push(child);
    this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
  }

  public async getChildren(): Promise<Array<DockerContainerEntryNode | DockerInfoNode | DockerResourceNode>> {
    if (this.kind === "image") return this.imageVersions;
    if (this.kind !== "container" || !DockerResourceNode.isRunning(this.meta)) return [];
    return listDockerContainerEntries(
      this.connection,
      this.services,
      this.identifier,
      "/",
      this,
    );
  }

  private static displayName(kind: DockerResourceKind, meta: Record<string, unknown>): string {
    if (kind === "container") {
      const names = rowValue(meta, "Names");
      return Array.isArray(names) && names[0] ? String(names[0]).replace(/^\//, "") : rowText(meta, "Id", "ID").slice(0, 12);
    }
    if (kind === "image") {
      return imageNameAndVersion(meta).name;
    }
    return rowText(meta, "Name", "name", "Id", "ID");
  }

  private static contextValue(kind: DockerResourceKind, meta: Record<string, unknown>): string {
    if (kind !== "container") return `docker${kind[0].toUpperCase()}${kind.slice(1)}`;
    const state = rowText(meta, "State").toLowerCase();
    return state === "running" || state === "restarting"
      ? "dockerContainerRunning"
      : state === "paused"
        ? "dockerContainerPaused"
        : "dockerContainerStopped";
  }

  private path(): string {
    const encoded = encodeURIComponent(this.identifier);
    return `/${this.kind === "container" ? "containers" : this.kind === "image" ? "images" : this.kind === "network" ? "networks" : "volumes"}/${encoded}`;
  }

  private async request(method: string, suffix = "", body?: unknown): Promise<QueryResult<Record<string, unknown>>> {
    const source = `${method} ${this.path()}${suffix}${body === undefined ? "" : `\n${JSON.stringify(body)}`}`;
    return this.services.connections.query(this.connection, source);
  }

  private async showRequest(source: string): Promise<void> {
    const result = await this.services.connections.query<Record<string, unknown>>(this.connection, source);
    await openResult(this.services, String(this.label), source, result);
  }

  public async delete(): Promise<void> {
    if (!(await this.confirm(`Delete Docker ${this.kind} ${String(this.label)}?`))) return;
    await this.request("DELETE", this.kind === "container" ? "?force=true" : "");
    this.parent.refresh();
  }

  public async drop(): Promise<void> {
    await this.delete();
  }

  public async cleanUp(): Promise<void> {
    await this.delete();
  }

  public async copyID(): Promise<void> {
    await vscode.env.clipboard.writeText(this.identifier);
  }

  public async inspect(): Promise<void> {
    await this.showRequest(`GET ${this.path()}`);
  }

  public async inspectImage(): Promise<void> {
    await this.inspect();
  }

  public async showStats(): Promise<void> {
    await this.showRequest(`GET ${this.path()}/stats?stream=false`);
  }

  public async showLogs(): Promise<void> {
    await this.showRequest(`GET ${this.path()}/logs?stdout=1&stderr=1&timestamps=1`);
  }

  public async start(): Promise<void> {
    await this.request("POST", "/start");
    this.parent.refresh();
  }

  public async stop(): Promise<void> {
    await this.request("POST", "/stop");
    this.parent.refresh();
  }

  public async pause(): Promise<void> {
    await this.request("POST", "/pause");
    this.parent.refresh();
  }

  public async unpause(): Promise<void> {
    await this.request("POST", "/unpause");
    this.parent.refresh();
  }

  public async restart(): Promise<void> {
    await this.request("POST", "/restart");
    this.parent.refresh();
  }

  public async updateRestartPolicy(): Promise<void> {
    await this.request("POST", "/update", { RestartPolicy: { Name: "always" } });
  }

  public async openPortInBrowser(): Promise<void> {
    const ports = rowValue(this.meta, "Ports");
    const port = Array.isArray(ports)
      ? ports.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).PublicPort)
      : undefined;
    const publicPort = port && typeof port === "object" ? (port as Record<string, unknown>).PublicPort : undefined;
    if (publicPort) {
      await vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${String(publicPort)}`));
    }
  }

  public async openTerminal(): Promise<void> {
    const state = {
      target: this.connection,
      connection: this.connection,
      container: this.identifier,
      path: "/",
    };
    await this.services.webviews.createWebviewPanel({
      title: `${String(this.label)} · terminal`,
      type: "xterm",
      route: "xterm",
      state,
      eventHandler: (handler) => registerDockerTerminal(
        handler,
        this.connection,
        this.services,
        this.identifier,
        "/",
      ),
    });
  }

  public async pullLatest(): Promise<void> {
    await this.request("POST", `/create?fromImage=${encodeURIComponent(String(this.label))}`);
    this.parent.refresh();
  }

  public async createContainer(): Promise<string> {
    const source = `POST /containers/create\n{\n  "Image": ${JSON.stringify(String(this.label))}\n}`;
    const document = await vscode.workspace.openTextDocument({ content: source, language: "json" });
    await vscode.window.showTextDocument(document);
    return source;
  }

  public async openDocument(): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse("https://docs.docker.com/engine/api/"));
  }

  private async confirm(message: string): Promise<boolean> {
    return (await vscode.window.showWarningMessage(message, { modal: true }, "Confirm")) === "Confirm";
  }

  public refresh(): void {
    this.parent.refresh();
  }
}
