import * as vscode from "vscode";

import { registerWebviewUtilityProtocols } from "../commands/webviewUtilityProtocols";
import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions, QueryResult } from "../database/types";

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
    this.iconPath = new vscode.ThemeIcon("package");
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
    super(label, `docker${kind[0].toUpperCase()}${kind.slice(1)}Group`, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("list-tree");
  }

  public async getChildren(): Promise<DockerResourceNode[]> {
    const result = await this.services.connections.query<Record<string, unknown>>(this.connection, `GET ${this.listPath}`);
    return resultRows(result).map((row) => new DockerResourceNode(this.kind, row, this.connection, this.services, this));
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

export class DockerResourceNode extends DockerTreeItem {
  private readonly identifier: string;

  public constructor(
    private readonly kind: DockerResourceKind,
    public readonly meta: Record<string, unknown>,
    private readonly connection: DockerConnection,
    private readonly services: ExtensionServices,
    public readonly parent: DockerGroupNode,
  ) {
    super(
      DockerResourceNode.displayName(kind, meta),
      DockerResourceNode.contextValue(kind, meta),
      vscode.TreeItemCollapsibleState.None,
    );
    this.identifier = rowText(meta, "Id", "ID", "Name", "name");
    this.description = kind === "container" ? rowText(meta, "Status", "State") : rowText(meta, "Created", "Driver");
    this.tooltip = this.identifier;
    this.iconPath = new vscode.ThemeIcon(kind === "container" ? "server-process" : kind === "image" ? "symbol-package" : "database");
  }

  private static displayName(kind: DockerResourceKind, meta: Record<string, unknown>): string {
    if (kind === "container") {
      const names = rowValue(meta, "Names");
      return Array.isArray(names) && names[0] ? String(names[0]).replace(/^\//, "") : rowText(meta, "Id", "ID").slice(0, 12);
    }
    if (kind === "image") {
      const tags = rowValue(meta, "RepoTags");
      return Array.isArray(tags) && tags[0] ? String(tags[0]) : rowText(meta, "RepoDigests", "Id", "ID").slice(0, 20);
    }
    return rowText(meta, "Name", "name", "Id", "ID");
  }

  private static contextValue(kind: DockerResourceKind, meta: Record<string, unknown>): string {
    if (kind !== "container") return `docker${kind[0].toUpperCase()}${kind.slice(1)}`;
    const state = rowText(meta, "State").toLowerCase();
    return state === "running" ? "dockerContainerRunning" : state === "paused" ? "dockerContainerPaused" : "dockerContainerStopped";
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
    await this.services.webviews.createWebviewPanel({
      title: `${String(this.label)} · terminal`,
      type: "xterm",
      route: "xterm",
      state: { connection: this.connection, container: this.identifier },
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
