import * as path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { TypedWebviewHandler } from "../core/webviewHandler";
import type { ConnectionOptions, QueryResult } from "../database/types";
import type { RemoteEntry, SshConnectionOptions, SshSession } from "../remote/sshService";

interface UtilityProtocolContext {
  readonly route: string;
  readonly target?: unknown;
  readonly state: Record<string, unknown>;
  readonly webviewState: Record<string, unknown>;
  readonly services: ExtensionServices;
  readonly handler: TypedWebviewHandler;
}

interface FileManagerEntry {
  readonly name: string;
  readonly path: string;
  readonly type: "file" | "directory" | "link" | "other";
  readonly size?: number | string;
  readonly modified?: unknown;
  readonly owner?: unknown;
  readonly kind?: string;
}

interface MockColumn {
  readonly name: string;
  readonly type: string;
  readonly value: string;
  readonly nullable: boolean;
  readonly isIndex?: boolean;
}

interface MockModel {
  readonly table: string;
  readonly mockCount: number;
  readonly mockStartIndex: number | string;
  readonly mockValueReference?: string;
  readonly mock: Record<string, { type: string; value: string; nullable?: boolean }>;
}

interface ForwardEntry {
  readonly id?: string | number | null;
  readonly name?: string;
  readonly type?: string;
  readonly autoStartUp?: boolean;
  readonly localHost?: string;
  readonly localPort?: number | string;
  readonly remoteHost?: string;
  readonly remotePort?: number | string;
  readonly status?: string;
  readonly [key: string]: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function parseRedisInfo(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, stringValue(item)]));
  }
  return String(value ?? "")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes(":"))
    .map((line) => line.split(/:(.*)/s))
    .reduce<Record<string, string>>((result, [key, item]) => {
      if (key) result[key] = item ?? "";
      return result;
    }, {});
}

function asConnection(value: unknown): ConnectionOptions | undefined {
  const candidate = record(value) as Partial<ConnectionOptions>;
  return candidate.id && candidate.type ? candidate as ConnectionOptions : undefined;
}

function targetConnection(state: Record<string, unknown>): ConnectionOptions | undefined {
  return asConnection(state.connection) || asConnection(state.target) || asConnection(state.options);
}

function targetRecord(state: Record<string, unknown>): Record<string, unknown> {
  return record(state.target);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizedRemotePath(value: unknown, fallback = "/"): string {
  const source = stringValue(value, fallback).trim() || fallback;
  if (source === "/") return source;
  return `/${source.replace(/^\/+|\/+$/g, "")}`;
}

function childRemotePath(parent: string, name: string): string {
  const cleanName = name.replace(/^\/+/, "");
  return parent === "/" ? `/${cleanName}` : `${parent.replace(/\/$/, "")}/${cleanName}`;
}

function parentRemotePath(value: string): string {
  if (value === "/") return "/";
  const parent = path.posix.dirname(value);
  return parent === "." ? "/" : parent;
}

function rowsOf<Row extends Record<string, unknown>>(result: QueryResult<Row>): Row[] {
  return Array.isArray(result.rows) ? result.rows : [];
}

function fileEntryFromRow(row: Record<string, unknown>, parent: string): FileManagerEntry {
  const name = stringValue(row.name || row.basename || row.filename, "Unnamed");
  const kind = stringValue(row.kind || row.type, "file").toLowerCase();
  const filePath = stringValue(row.path || row.filename, childRemotePath(parent, name));
  return {
    name,
    path: filePath.startsWith("/") ? filePath : `/${filePath}`,
    type: kind === "directory" || kind === "dir"
      ? "directory"
      : kind === "link" ? "link" : kind === "other" ? "other" : "file",
    size: typeof row.size === "number" || typeof row.size === "string" ? row.size : undefined,
    modified: row.modified || row.lastmod,
    owner: row.owner || row.uid || row.user,
    kind,
  };
}

function fileEntryFromSsh(entry: RemoteEntry): FileManagerEntry {
  return {
    name: entry.name,
    path: entry.path,
    type: entry.kind,
    size: entry.size,
    modified: entry.modifiedAt?.toISOString(),
    owner: entry.owner,
    kind: entry.kind,
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function elasticSearchStatusRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const diskUsed = Number.parseFloat(stringValue(row["disk.used"], "0"));
    const diskTotal = Number.parseFloat(stringValue(row["disk.total"], "0"));
    const diskUsage = Number.isFinite(diskUsed) && Number.isFinite(diskTotal) && diskTotal > 0
      ? `${Math.round((diskUsed / diskTotal) * 100)}%`
      : "0%";
    return {
      ...row,
      isMain: stringValue(row.master) === "*",
      cpuUsage: `${stringValue(row.cpu, "0")}%`,
      diskUsage,
      heapPercent: `${stringValue(row["heap.percent"], "0")}%`,
    };
  });
}

function resourceConnectionType(connection: ConnectionOptions): boolean {
  return ["FTP", "S3", "WebDAV", "etcd"].includes(connection.type);
}

function languageForFile(fileName: string): string {
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

async function sendError(handler: TypedWebviewHandler, error: unknown): Promise<void> {
  await handler.send("error", { message: errorText(error) });
}

function connectionRecords(value: unknown): ConnectionOptions[] {
  if (Array.isArray(value)) {
    return value.map(asConnection).filter((item): item is ConnectionOptions => Boolean(item));
  }
  return Object.values(record(value))
    .map(asConnection)
    .filter((item): item is ConnectionOptions => Boolean(item));
}

function registerRemoteFileManager(context: UtilityProtocolContext): void {
  const { handler, services, state, webviewState } = context;
  let currentPath = normalizedRemotePath(webviewState.path || state.path, "/");

  const connection = (): ConnectionOptions | undefined =>
    targetConnection(state) || services.activeConnection.get();

  const emitConfig = async (): Promise<void> => {
    const selected = connection();
    const isSsh = selected?.type === "SSH" || selected?.type === "SFTP";
    const supported = Boolean(selected && (isSsh || resourceConnectionType(selected)));
    await handler.send("config", {
      name: selected?.name || selected?.id || selected?.host || "Remote files",
      sftpDisabled: !supported,
      fsType: isSsh ? "sftp" : selected?.type?.toLowerCase() || "sftp",
      rootPath: "/",
      currentPath,
    });
  };

  const list = async (requestedPath?: unknown): Promise<void> => {
    const selected = connection();
    if (requestedPath != null) {
      currentPath = normalizedRemotePath(requestedPath, currentPath);
    }
    if (!selected) {
      await emitConfig();
      await handler.send("fileList", { path: currentPath, files: [] });
      return;
    }
    await handler.send("loading", true);
    try {
      let files: FileManagerEntry[];
      if (selected.type === "SSH" || selected.type === "SFTP") {
        const session = await services.ssh.open(selected as SshConnectionOptions);
        files = (await session.list(currentPath)).map(fileEntryFromSsh);
      } else {
        const result = await services.connections.query<Record<string, unknown>>(
          selected,
          `LIST ${currentPath}`,
        );
        files = rowsOf(result).map((row) => fileEntryFromRow(row, currentPath));
      }
      await handler.send("fileList", { path: currentPath, files });
      await handler.setWebviewState({ ...webviewState, currentPath });
    } catch (error) {
      await sendError(handler, error);
    } finally {
      await handler.send("loading", false);
    }
  };

  const queryResource = async (source: string): Promise<QueryResult<Record<string, unknown>>> => {
    const selected = connection();
    if (!selected) throw new Error("No remote connection selected");
    return services.connections.query<Record<string, unknown>>(selected, source);
  };

  const withRemoteMutation = async (operation: (selected: ConnectionOptions) => Promise<void>): Promise<void> => {
    const selected = connection();
    if (!selected) throw new Error("No remote connection selected");
    await operation(selected);
    await list(currentPath);
  };

  const safeRemoteMutation = async (operation: (selected: ConnectionOptions) => Promise<void>): Promise<void> => {
    try {
      await withRemoteMutation(operation);
    } catch (error) {
      await sendError(handler, error);
    }
  };

  const readRemote = async (selected: ConnectionOptions, remotePath: string): Promise<Buffer> => {
    if (selected.type === "SSH" || selected.type === "SFTP") {
      const session = await services.ssh.open(selected as SshConnectionOptions);
      return session.readFile(remotePath);
    }
    const result = await queryResource(`READ ${remotePath}`);
    const encoded = stringValue(rowsOf(result)[0]?.contentBase64);
    return Buffer.from(encoded, "base64");
  };

  const writeRemote = async (selected: ConnectionOptions, remotePath: string, content: Buffer): Promise<void> => {
    if (selected.type === "SSH" || selected.type === "SFTP") {
      const session = await services.ssh.open(selected as SshConnectionOptions);
      await session.writeFile(remotePath, content);
      return;
    }
    await queryResource(`WRITE ${remotePath}\n${content.toString("base64")}`);
  };

  const downloadDirectory = async (
    selected: ConnectionOptions,
    remotePath: string,
    localPath: string,
  ): Promise<void> => {
    await mkdir(localPath, { recursive: true });
    const entries: FileManagerEntry[] = selected.type === "SSH" || selected.type === "SFTP"
      ? (await (await services.ssh.open(selected as SshConnectionOptions)).list(remotePath)).map(fileEntryFromSsh)
      : rowsOf(await queryResource(`LIST ${remotePath}`)).map((row) => fileEntryFromRow(row, remotePath));
    for (const remoteEntry of await entries) {
      const name = stringValue(remoteEntry.name);
      if (!name || name === "." || name === "..") continue;
      const remoteChild = stringValue(remoteEntry.path, childRemotePath(remotePath, name));
      const localChild = path.join(localPath, name);
      if (remoteEntry.type === "directory") {
        await downloadDirectory(selected, remoteChild, localChild);
      } else if (selected.type === "SSH" || selected.type === "SFTP") {
        await (await services.ssh.open(selected as SshConnectionOptions)).download(remoteChild, localChild);
      } else {
        await writeFile(localChild, await readRemote(selected, remoteChild));
      }
    }
  };

  const onInit = async (): Promise<void> => {
    await emitConfig();
    await list(currentPath);
  };

  handler.on("initSftpConfig", () => emitConfig());
  handler.on("initSftp", onInit);
  handler.on("init", onInit);
  handler.on("load", (content) => list(record(content).path));
  handler.on("refreshAdapter", onInit);
  handler.on("createFolder", (content) => safeRemoteMutation(async (selected) => {
    const item = record(content);
    const name = stringValue(item.name).trim();
    if (!name) return;
    const parent = normalizedRemotePath(item.path, currentPath);
    if (selected.type === "SSH" || selected.type === "SFTP") {
      const session = await services.ssh.open(selected as SshConnectionOptions);
      await session.mkdir(childRemotePath(parent, name), true);
    } else {
      await queryResource(`MKDIR ${childRemotePath(parent, name)}`);
    }
  }));
  handler.on("createFile", (content) => safeRemoteMutation(async (selected) => {
    const item = record(content);
    const name = stringValue(item.name).trim();
    if (!name) return;
    const parent = normalizedRemotePath(item.path, currentPath);
    await writeRemote(selected, childRemotePath(parent, name), Buffer.alloc(0));
  }));
  handler.on("delete", (content) => safeRemoteMutation(async (selected) => {
    const item = record(record(content).item);
    const remotePath = stringValue(item.path);
    if (!remotePath) return;
    const confirmed = await vscode.window.showWarningMessage(
      `Delete remote ${item.type === "directory" ? "directory" : "file"} ${remotePath}?`,
      { modal: true },
      "Delete",
    );
    if (confirmed !== "Delete") return;
    if (selected.type === "SSH" || selected.type === "SFTP") {
      const session = await services.ssh.open(selected as SshConnectionOptions);
      await session.remove(remotePath, item.type === "directory");
    } else {
      await queryResource(`DELETE ${remotePath}`);
    }
  }));
  handler.on("rename", (content) => safeRemoteMutation(async (selected) => {
    const payload = record(content);
    const item = record(payload.item);
    const remotePath = stringValue(item.path);
    const newName = stringValue(payload.newName).trim();
    if (!remotePath || !newName) return;
    const newPath = childRemotePath(parentRemotePath(remotePath), newName);
    if (selected.type === "SSH" || selected.type === "SFTP") {
      const session = await services.ssh.open(selected as SshConnectionOptions);
      await session.rename(remotePath, newPath);
    } else {
      await queryResource(`RENAME ${remotePath}\n${newPath}`);
    }
  }));
  handler.on("upload", (content) => safeRemoteMutation(async (selected) => {
    const parent = normalizedRemotePath(record(content).path, currentPath);
    const files = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: true });
    for (const file of files || []) {
      const remotePath = childRemotePath(parent, path.basename(file.fsPath));
      if (selected.type === "SSH" || selected.type === "SFTP") {
        const session = await services.ssh.open(selected as SshConnectionOptions);
        await session.upload(file.fsPath, remotePath);
      } else {
        await writeRemote(selected, remotePath, await readFile(file.fsPath));
      }
    }
  }));
  handler.on("download", async (content) => {
    try {
      const item = record(record(content).item);
      const remotePath = stringValue(item.path);
      const isDirectory = item.type === "directory" || item.kind === "directory";
      if (!remotePath) return;
      const selected = connection();
      if (!selected) throw new Error("No remote connection selected");
      if (isDirectory) {
        const folders = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Download here",
        });
        const folder = folders?.[0];
        if (!folder) return;
        await downloadDirectory(selected, remotePath, path.join(folder.fsPath, stringValue(item.name, "download")));
        await handler.send("result", { action: "download-directory", path: remotePath, localPath: folder.fsPath });
      } else {
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(stringValue(item.name, path.posix.basename(remotePath))),
          saveLabel: "Download",
        });
        if (!target) return;
        if (selected.type === "SSH" || selected.type === "SFTP") {
          const session = await services.ssh.open(selected as SshConnectionOptions);
          await session.download(remotePath, target.fsPath);
        } else {
          await writeFile(target.fsPath, await readRemote(selected, remotePath));
        }
        await handler.send("result", { action: "download", path: remotePath, localPath: target.fsPath });
      }
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("openFolderTerminal", async (content) => {
    try {
      const selected = connection();
      if (!selected || (selected.type !== "SSH" && selected.type !== "SFTP")) {
        throw new Error("Folder terminal requires an SSH or SFTP connection");
      }
      const item = record(record(content).item);
      const remotePath = normalizedRemotePath(item.path, currentPath);
      await services.webviews.createWebviewPanel({
        title: `${selected.name || selected.id} · ${remotePath}`,
        type: "sshTerminal",
        id: "sshTerminal",
        route: "sshTerminal",
        state: { connection: selected, path: remotePath },
        eventHandler: (terminalHandler) => registerSshTerminal({
          route: "sshTerminal",
          target: { connection: selected, path: remotePath },
          state: { connection: selected, path: remotePath },
          webviewState: { route: "sshTerminal", connection: selected, path: remotePath },
          services,
          handler: terminalHandler,
        }),
      });
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("openFile", async (content) => {
    try {
      const item = record(record(content).item);
      const remotePath = stringValue(item.path);
      if (!remotePath) return;
      if (item.type === "directory") {
        await list(remotePath);
        return;
      }
      const selected = connection();
      if (!selected) throw new Error("No remote connection selected");
      const bytes = await readRemote(selected, remotePath);
      const document = await vscode.workspace.openTextDocument({
        content: bytes.toString("utf8"),
        language: languageForFile(stringValue(item.name, path.posix.basename(remotePath))),
      });
      await vscode.window.showTextDocument(document);
    } catch (error) {
      await sendError(handler, error);
    }
  });
}

function registerSshTerminal(context: UtilityProtocolContext): void {
  const { handler, services, state } = context;
  let channel: Awaited<ReturnType<SshSession["shell"]>> | undefined;
  let opening: Promise<void> | undefined;
  const selected = (): SshConnectionOptions | undefined => {
    const connection = targetConnection(state) || services.activeConnection.get();
    return connection && (connection.type === "SSH" || connection.type === "SFTP")
      ? connection as SshConnectionOptions
      : undefined;
  };
  const output = async (value: unknown): Promise<void> => {
    const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "");
    if (text) await handler.send("data", text);
  };
  const open = async (): Promise<void> => {
    if (channel) return;
    if (opening) return opening;
    opening = (async () => {
      const connection = selected();
      if (!connection) throw new Error("No SSH connection selected");
      const session = await services.ssh.open(connection);
      const shell = await session.shell();
      channel = shell;
      shell.on("data", (value: Buffer | string) => { void output(value); });
      shell.stderr.on("data", (value: Buffer | string) => { void output(value); });
      const initialPath = normalizedRemotePath(
        state.path || record(state.target).path,
        "/",
      );
      if (initialPath !== "/") {
        shell.write(`cd ${shellQuote(initialPath)}\n`);
      }
      shell.once("close", () => {
        channel = undefined;
        void handler.send("close");
      });
      await handler.send("ready", { connection: connection.name || connection.id });
    })();
    try {
      await opening;
    } finally {
      opening = undefined;
    }
  };
  handler.on("initTerminal", async () => {
    try { await open(); } catch (error) { await sendError(handler, error); }
  });
  handler.on("input", async (content) => {
    try {
      await open();
      const value = typeof content === "string" ? content : stringValue(record(content).data || content);
      channel?.write(value);
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("resize", async (content) => {
    try {
      await open();
      const payload = record(content);
      const rows = Math.max(1, Number(payload.rows) || 24);
      const cols = Math.max(1, Number(payload.cols) || 80);
      const candidate = channel as unknown as { setWindow?: (rows: number, cols: number, height: number, width: number) => void } | undefined;
      candidate?.setWindow?.(rows, cols, 0, 0);
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("closeTerminal", () => {
    channel?.end();
    channel = undefined;
  });
}

function mockKey(state: Record<string, unknown>): string {
  const target = targetRecord(state);
  return stringValue(target.id || target.table || target.tableWithSchema || target.label, "default");
}

async function buildMockModel(
  state: Record<string, unknown>,
  services: ExtensionServices,
  reset: boolean,
): Promise<MockModel> {
  const target = targetRecord(state);
  const table = stringValue(target.tableWithSchema || target.table || target.label, "table_name");
  const targetChildren = target.getChildren;
  const children = typeof targetChildren === "function"
    ? await (targetChildren as () => Promise<unknown[]>).call(target)
    : [];
  const columns = children
    .map((child): MockColumn | undefined => {
      const item = record(child);
      const column = record(item.column);
      const name = stringValue(column.name || item.label);
      if (!name || column.isAutoIncrement === true) return undefined;
      const type = stringValue(column.originType || column.type, "varchar");
      return {
        name,
        type,
        value: stringValue(column.defaultValue || column.default || "@string('lower',5)"),
        nullable: column.isNotNull !== true,
        isIndex: item.isPrimaryKey === true || column.isPrimaryKey === true,
      };
    })
    .filter((item): item is MockColumn => Boolean(item));
  const defaults: MockModel = {
    table,
    mockCount: 10,
    mockStartIndex: columns.some((column) => column.isIndex) ? "auto" : 1,
    mockValueReference: "https://mockjs.com/examples.html",
    mock: Object.fromEntries(columns.map((column) => [
      column.name,
      { type: column.type, value: column.value, nullable: column.nullable },
    ])),
  };
  if (reset) return defaults;
  const saved = services.state.get<Record<string, unknown>>("mysql.mock.models", {});
  const cached = record(saved[mockKey(state)]);
  return cached.table ? { ...defaults, ...cached, mock: record(cached.mock) as MockModel["mock"] } : defaults;
}

async function saveMockModel(
  state: Record<string, unknown>,
  services: ExtensionServices,
  model: MockModel,
): Promise<void> {
  const saved = services.state.get<Record<string, unknown>>("mysql.mock.models", {});
  await services.state.update("mysql.mock.models", {
    ...saved,
    [mockKey(state)]: model,
  });
}

function quoteQualifiedIdentifier(value: string, quote: (identifier: string) => string): string {
  return value.split(".").map((part) => quote(part.trim())).join(".");
}

function mockSqlValue(value: unknown, index: number, escapeLiteral: (input: string) => string): string {
  const text = stringValue(value);
  if (/^\$mockIndex$|^@mockIndex$|^@integer/i.test(text)) return String(index);
  if (/^null$/i.test(text)) return "NULL";
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return text;
  const generated = text
    .replace(/@string\([^,]+,\s*(\d+)\)/gi, (_match, size: string) => "x".repeat(Math.max(1, Number(size))))
    .replace(/@integer\([^)]*\)/gi, String(index));
  return escapeLiteral(generated);
}

async function runMockModel(
  state: Record<string, unknown>,
  services: ExtensionServices,
  model: MockModel,
): Promise<number> {
  const connection = targetConnection(state) || services.activeConnection.get();
  if (!connection) throw new Error("No database connection selected");
  const dialect = services.dialects.resolve(connection.type);
  const table = quoteQualifiedIdentifier(model.table, (identifier) => dialect.quoteIdentifier(identifier));
  const columns = Object.keys(model.mock);
  if (!columns.length) throw new Error("Mock model has no enabled columns");
  const columnSql = columns.map((column) => dialect.quoteIdentifier(column)).join(", ");
  const start = model.mockStartIndex === "auto" ? 1 : Number(model.mockStartIndex) || 1;
  const count = Math.max(1, Math.min(10_000, Number(model.mockCount) || 10));
  let affectedRows = 0;
  for (let index = start; index < start + count; index += 1) {
    const values = columns.map((column) => mockSqlValue(model.mock[column]?.value, index, dialect.escapeLiteral));
    const result = await services.connections.query(connection, `INSERT INTO ${table} (${columnSql}) VALUES (${values.join(", ")});`);
    affectedRows += result.affectedRows || 0;
  }
  return affectedRows || count;
}

function registerMock(context: UtilityProtocolContext): void {
  const { handler, services, state, webviewState } = context;
  const load = async (reset: boolean): Promise<void> => {
    try {
      const model = await buildMockModel(state, services, reset);
      await handler.send("mockMeta", model);
      await handler.setWebviewState({ ...webviewState, mock: model });
    } catch (error) {
      await sendError(handler, error);
    }
  };
  handler.onInit("mock", () => load(false));
  handler.on("saveMock", async (content) => {
    try {
      const model = record(content) as unknown as MockModel;
      await saveMockModel(state, services, model);
      await handler.send("mockMeta", model);
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("resetMock", () => load(true));
  handler.on("runMock", async (content) => {
    try {
      const model = record(content) as unknown as MockModel;
      await saveMockModel(state, services, model);
      const affectedRows = await runMockModel(state, services, model);
      await handler.send("mock_done", {
        success: true,
        message: `Generated ${affectedRows} mock row(s).`,
      });
    } catch (error) {
      await handler.send("mock_done", { success: false, message: errorText(error) });
      await sendError(handler, error);
    }
  });
}

function rabbitPath(vhost: string, resource: string): string {
  return `${encodeURIComponent(vhost)}/${encodeURIComponent(resource)}`;
}

function registerRabbitQueue(context: UtilityProtocolContext): void {
  const { handler, services, state } = context;
  const target = targetRecord(state);
  const queue = stringValue(target.queue || target.label || target.name, "queue_name");
  const vhost = stringValue(target.vhost, "/");
  const connection = (): ConnectionOptions | undefined => targetConnection(state) || services.activeConnection.get();
  const execute = async (source: string): Promise<Record<string, unknown>[]> => {
    const selected = connection();
    if (!selected) throw new Error("No RabbitMQ connection selected");
    return rowsOf(await services.connections.query<Record<string, unknown>>(selected, source));
  };
  const queueUrl = rabbitPath(vhost, queue);
  const getMessages = async (
    count: number,
    ackmode: "ack_requeue_true" | "ack_requeue_false",
  ): Promise<Record<string, unknown>[]> => execute(`POST /api/queues/${queueUrl}/get\n${JSON.stringify({
    vhost,
    name: queue,
    truncate: "50000",
    ackmode,
    encoding: "auto",
    count: String(count),
  }, null, 2)}`);

  const publishToQueue = async (
    targetQueue: string,
    message: Record<string, unknown>,
  ): Promise<void> => {
    const properties = record(message.properties);
    const headers = record(message.headers || properties.headers);
    await execute(`POST /api/exchanges/${rabbitPath(vhost, "amq.default")}/publish\n${JSON.stringify({
      vhost,
      name: "amq.default",
      properties: { ...properties, delivery_mode: properties.delivery_mode || 2, headers },
      routing_key: targetQueue,
      delivery_mode: String(properties.delivery_mode || message.delivery_mode || 2),
      payload: stringValue(message.payload || message.body),
      payload_encoding: stringValue(message.payload_encoding, "string"),
      headers,
      props: {},
    }, null, 2)}`);
  };

  const emitDetail = async (): Promise<void> => {
    const detail = (await execute(`GET /api/queues/${queueUrl}`))[0] || {};
    const queues = (await execute(`GET /api/queues/${encodeURIComponent(vhost)}`))
      .map((item) => stringValue(item.name))
      .filter((name) => name && name !== queue);
    await handler.send("detail", {
      queue,
      vhost,
      messagesReady: detail.messages_ready || 0,
      queues,
    });
  };
  const loadMessages = async (content?: unknown): Promise<void> => {
    const count = Math.max(1, Number(record(content).count) || 30);
    const rows = await getMessages(count, "ack_requeue_true");
    const detail = (await execute(`GET /api/queues/${queueUrl}`))[0] || {};
    await handler.send("messages", {
      messages: rows,
      messagesReady: detail.messages_ready || 0,
    });
  };
  const loadBindings = async (): Promise<void> => {
    await handler.send("bindings", { bindings: await execute(`GET /api/queues/${queueUrl}/bindings`) });
  };
  const loadExchanges = async (): Promise<void> => {
    await handler.send("exchanges", { exchanges: await execute(`GET /api/exchanges/${encodeURIComponent(vhost)}`) });
  };
  const loadConsumers = async (): Promise<void> => {
    const detail = (await execute(`GET /api/queues/${queueUrl}`))[0] || {};
    await handler.send("consumers", { consumers: Array.isArray(detail.consumer_details) ? detail.consumer_details : [] });
  };
  const initialize = async (): Promise<void> => {
    try {
      await emitDetail();
      await loadMessages({ count: 30 });
    } catch (error) {
      await sendError(handler, error);
    }
  };
  handler.on("init", initialize);
  handler.on("refresh", initialize);
  handler.on("loadMessages", async (content) => {
    try { await loadMessages(content); } catch (error) { await sendError(handler, error); }
  });
  handler.on("loadBindings", async () => {
    try { await loadBindings(); } catch (error) { await sendError(handler, error); }
  });
  handler.on("loadExchanges", async () => {
    try { await loadExchanges(); } catch (error) { await sendError(handler, error); }
  });
  handler.on("loadConsumers", async () => {
    try { await loadConsumers(); } catch (error) { await sendError(handler, error); }
  });
  handler.on("sendMessage", async (content) => {
    try {
      const payload = record(content);
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const targetQueue = stringValue(payload.targetQueue, queue);
      for (const message of messages) {
        await publishToQueue(targetQueue, typeof message === "object" ? record(message) : { payload: String(message) });
      }
      await handler.send("success", `Sent ${messages.length} message(s) to ${targetQueue}`);
      await initialize();
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("moveMessage", async (content) => {
    try {
      const payload = record(content);
      const indices = (Array.isArray(payload.indices) ? payload.indices : [])
        .map(Number)
        .filter((index) => Number.isInteger(index) && index >= 0)
        .sort((left, right) => right - left);
      const targetQueue = stringValue(payload.targetQueue).trim();
      if (!targetQueue) throw new Error("Target queue is required");
      for (const index of indices) {
        for (let current = 0; current <= index; current += 1) {
          const message = (await getMessages(1, "ack_requeue_false"))[0];
          if (!message) throw new Error("Message not found");
          await publishToQueue(current === index ? targetQueue : queue, message);
        }
      }
      await handler.send("success", `Moved ${indices.length} message(s) to ${targetQueue}`);
      await initialize();
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("deleteMessage", async (content) => {
    try {
      const rawIndices = record(content).indices;
      const indices = (Array.isArray(rawIndices) ? rawIndices : [])
        .map((value: unknown) => Number(value))
        .filter((index) => Number.isInteger(index) && index >= 0)
        .sort((left, right) => right - left);
      for (const index of indices) {
        for (let current = 0; current <= index; current += 1) {
          const message = (await getMessages(1, "ack_requeue_false"))[0];
          if (!message) throw new Error("Message not found");
          if (current < index) await publishToQueue(queue, message);
        }
      }
      await handler.send("success", `Deleted ${indices.length} message(s).`);
      await initialize();
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("deleteBindings", async (content) => {
    try {
      const items = (Array.isArray(record(content).items) ? record(content).items : []) as unknown[];
      for (const item of items) {
        const binding = record(item);
        const exchange = stringValue(binding.source);
        const routingKey = encodeURIComponent(stringValue(binding.propertiesKey || binding.routing_key));
        await execute(`DELETE /api/bindings/${rabbitPath(vhost, exchange)}/q/${encodeURIComponent(queue)}/${routingKey}`);
      }
      await handler.send("success", `Deleted ${items.length} binding(s).`);
      await loadBindings();
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("createBinding", async (content) => {
    try {
      const payload = record(content);
      const exchange = stringValue(payload.exchange);
      const routingKey = stringValue(payload.routingKey);
      await execute(`POST /api/bindings/${rabbitPath(vhost, exchange)}/q/${encodeURIComponent(queue)}\n${JSON.stringify({ routing_key: routingKey, arguments: {} })}`);
      await handler.send("success", `Created binding to ${exchange || "(AMQP default)"}.`);
      await loadBindings();
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("publishMessage", async (content) => {
    try {
      const payload = record(content);
      const exchange = stringValue(payload.exchange, "amq.default");
      const routingKey = stringValue(payload.routingKey, queue);
      await execute(`POST /api/exchanges/${rabbitPath(vhost, exchange)}/publish\n${JSON.stringify({
        vhost,
        name: exchange,
        properties: { ...(record(payload.properties)), delivery_mode: payload.deliveryMode || 2, headers: record(payload.headers) },
        routing_key: routingKey,
        delivery_mode: String(payload.deliveryMode || 2),
        payload: stringValue(payload.payload),
        payload_encoding: "string",
        headers: record(payload.headers),
        props: {},
      }, null, 2)}`);
      await handler.send("success", "Published message successfully.");
      await initialize();
    } catch (error) { await sendError(handler, error); }
  });
}

function registerRedisKey(context: UtilityProtocolContext): void {
  const { handler, services, state } = context;
  const target = targetRecord(state);
  let key = stringValue(target.key || target.label || target.name, "key");
  let redisType = stringValue(target.type, "string");
  let lastValue: unknown;
  const connection = (): ConnectionOptions | undefined => targetConnection(state) || services.activeConnection.get();
  const execute = async (command: string): Promise<Record<string, unknown>[]> => {
    const selected = connection();
    if (!selected) throw new Error("No Redis connection selected");
    return rowsOf(await services.connections.query<Record<string, unknown>>(selected, command));
  };
  const valueOf = async (command: string): Promise<unknown> => (await execute(command))[0]?.value;
  const collectionCount = (value: unknown): number | undefined => {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return Object.keys(value).length;
    return undefined;
  };
  const loadStatus = async (): Promise<void> => {
    try {
      const infoMap = parseRedisInfo(await valueOf("INFO"));
      await handler.send("status", {
        database: stringValue(target.database || target.db, "0"),
        tags: [infoMap.redis_version ? `Redis ${infoMap.redis_version}` : "Redis"],
        uptime: infoMap.uptime_in_seconds || "-",
        connectedClients: infoMap.connected_clients || "0",
        memoryUsage: infoMap.used_memory_human || infoMap.used_memory || "-",
        infoMap,
        infoList: Object.entries(infoMap).map(([key, value]) => ({ key, value })),
      });
    } catch (error) {
      await sendError(handler, error);
    }
  };
  const load = async (): Promise<void> => {
    try {
      redisType = stringValue(await valueOf(`TYPE ${JSON.stringify(key)}`), "string");
      let value: unknown;
      switch (redisType) {
        case "hash":
          value = await valueOf(`HGETALL ${JSON.stringify(key)}`);
          break;
        case "list":
          value = await valueOf(`LRANGE ${JSON.stringify(key)} 0 -1`);
          break;
        case "set":
          value = await valueOf(`SMEMBERS ${JSON.stringify(key)}`);
          break;
        case "zset": {
          const raw = await valueOf(`ZRANGE ${JSON.stringify(key)} 0 -1 WITHSCORES`);
          const values = Array.isArray(raw) ? raw : [];
          value = [];
          for (let index = 0; index + 1 < values.length; index += 2) {
            (value as Array<Record<string, unknown>>).push({ value: values[index], score: values[index + 1] });
          }
          break;
        }
        case "stream":
          value = await valueOf(`XRANGE ${JSON.stringify(key)} - +`);
          break;
        case "ReJSON-RL":
          value = await valueOf(`JSON.GET ${JSON.stringify(key)} $`);
          break;
        default:
          value = await valueOf(`GET ${JSON.stringify(key)}`);
          break;
      }
      if (redisType === "ReJSON-RL" && typeof value === "string") {
        try { value = JSON.parse(value); } catch { /* RedisJSON may contain a scalar string. */ }
      }
      lastValue = value;
      const ttl = await valueOf(`TTL ${JSON.stringify(key)}`);
      await handler.send("detail", {
        key,
        value,
        type: redisType,
        ttl,
        count: collectionCount(value),
      });
    } catch (error) {
      await sendError(handler, error);
    }
  };
  const update = async (content: unknown): Promise<void> => {
    try {
      const payload = record(content);
      const value = payload.value ?? content;
      const type = stringValue(payload.type, redisType);
      const serialized = typeof value === "string" ? value : JSON.stringify(value);
      switch (type) {
        case "hash": {
          await execute(`DEL ${JSON.stringify(key)}`);
          const items = Array.isArray(value) ? value : Object.entries(record(value)).map(([field, item]) => ({ field, value: item }));
          for (const item of items) {
            const row = record(item);
            const field = stringValue(row.field || row.key);
            if (field) await execute(`HSET ${JSON.stringify(key)} ${JSON.stringify(field)} ${JSON.stringify(stringValue(row.value))}`);
          }
          break;
        }
        case "list":
        case "set": {
          await execute(`DEL ${JSON.stringify(key)}`);
          const values = Array.isArray(value) ? value : [];
          for (const item of values) {
            const command = type === "list" ? "RPUSH" : "SADD";
            await execute(`${command} ${JSON.stringify(key)} ${JSON.stringify(stringValue(record(item).value ?? item))}`);
          }
          break;
        }
        case "zset": {
          await execute(`DEL ${JSON.stringify(key)}`);
          for (const item of Array.isArray(value) ? value : []) {
            const row = record(item);
            await execute(`ZADD ${JSON.stringify(key)} ${Number(row.score) || 0} ${JSON.stringify(stringValue(row.value))}`);
          }
          break;
        }
        case "ReJSON-RL": {
          let jsonValue: unknown = value;
          if (typeof value === "string") {
            try {
              jsonValue = JSON.parse(value);
            } catch {
              jsonValue = value;
            }
          }
          const jsonText = JSON.stringify(jsonValue);
          if (jsonText === undefined) throw new Error("RedisJSON value is not serializable");
          await execute(`JSON.SET ${JSON.stringify(key)} $ ${jsonText}`);
          break;
        }
        case "stream":
          await execute(`DEL ${JSON.stringify(key)}`);
          for (const item of Array.isArray(value) ? value : []) {
            const row = record(item);
            const fields = record(row.value);
            for (const [field, fieldValue] of Object.entries(fields)) {
              await execute(`XADD ${JSON.stringify(key)} * ${JSON.stringify(field)} ${JSON.stringify(stringValue(fieldValue))}`);
            }
          }
          break;
        default:
          await execute(`SET ${JSON.stringify(key)} ${JSON.stringify(serialized)}`);
          break;
      }
      await handler.send("success", "Redis key updated.");
      await load();
    } catch (error) { await sendError(handler, error); }
  };
  const createKey = async (content: unknown): Promise<void> => {
    try {
      const payload = record(record(content).key || content);
      const name = stringValue(payload.name || payload.key).trim();
      const type = stringValue(payload.type, "string");
      if (!name) throw new Error("Redis key name cannot be empty");
      const contentValue = stringValue(payload.content, "value");
      const args = (value: unknown): string => JSON.stringify(stringValue(value));
      switch (type) {
        case "hash": {
          const items = Array.isArray(payload.hashItems) ? payload.hashItems : [];
          const rows = items.length > 0 ? items : [{ field: "field", value: contentValue }];
          for (const item of rows) {
            const row = record(item);
            await execute(`HSET ${JSON.stringify(name)} ${args(row.field || row.key || "field")} ${args(row.value ?? contentValue)}`);
          }
          break;
        }
        case "list": {
          const values = Array.isArray(payload.listItems) ? payload.listItems : [{ value: contentValue }];
          for (const item of values) await execute(`RPUSH ${JSON.stringify(name)} ${args(record(item).value ?? item)}`);
          break;
        }
        case "set": {
          const values = Array.isArray(payload.setItems) ? payload.setItems : [{ value: contentValue }];
          for (const item of values) await execute(`SADD ${JSON.stringify(name)} ${args(record(item).value ?? item)}`);
          break;
        }
        case "zset": {
          const values = Array.isArray(payload.zsetItems) ? payload.zsetItems : [{ score: 0, value: contentValue }];
          for (const item of values) {
            const row = record(item);
            await execute(`ZADD ${JSON.stringify(name)} ${Number(row.score) || 0} ${args(row.value ?? contentValue)}`);
          }
          break;
        }
        case "stream": {
          const values = Array.isArray(payload.streamItems) ? payload.streamItems : [{ field: "field", value: contentValue }];
          for (const item of values) {
            const row = record(item);
            await execute(`XADD ${JSON.stringify(name)} * ${args(row.field || "field")} ${args(row.value ?? contentValue)}`);
          }
          break;
        }
        case "ReJSON-RL": {
          let value: unknown = payload.content ?? contentValue;
          if (typeof value === "string") {
            try { value = JSON.parse(value); } catch { /* Keep scalar JSON strings as-is. */ }
          }
          const serialized = JSON.stringify(value);
          if (serialized === undefined) throw new Error("RedisJSON value is not serializable");
          await execute(`JSON.SET ${JSON.stringify(name)} $ ${serialized}`);
          break;
        }
        default:
          await execute(`SET ${JSON.stringify(name)} ${args(payload.content ?? contentValue)}`);
      }
      const ttl = Number(payload.ttl);
      if (Number.isFinite(ttl) && ttl >= 0) await execute(`EXPIRE ${JSON.stringify(name)} ${Math.trunc(ttl)}`);
      key = name;
      redisType = type;
      await handler.send("success", `Redis key ${name} created.`);
      await load();
    } catch (error) { await sendError(handler, error); }
  };
  const deleteLine = async (content: unknown): Promise<void> => {
    try {
      const row = record(record(content).item || content);
      switch (redisType) {
        case "hash":
          await execute(`HDEL ${JSON.stringify(key)} ${JSON.stringify(stringValue(row.key || row.field))}`);
          break;
        case "list":
          await execute(`LREM ${JSON.stringify(key)} 1 ${JSON.stringify(stringValue(row.value))}`);
          break;
        case "set":
          await execute(`SREM ${JSON.stringify(key)} ${JSON.stringify(stringValue(row.value))}`);
          break;
        case "zset":
          await execute(`ZREM ${JSON.stringify(key)} ${JSON.stringify(stringValue(row.value))}`);
          break;
        case "stream":
          await execute(`XDEL ${JSON.stringify(key)} ${JSON.stringify(stringValue(row.id || row.key))}`);
          break;
        default:
          throw new Error(`Cannot delete an item from Redis type ${redisType}`);
      }
      await handler.send("success", "Redis item deleted.");
      await load();
    } catch (error) { await sendError(handler, error); }
  };
  const changePage = async (content: unknown): Promise<void> => {
    const payload = record(content);
    const pageNum = Math.max(1, Number(payload.pageNum || record(payload.page).pageNum) || 1);
    const pageSize = Math.max(1, Number(payload.pageSize || record(payload.page).pageSize) || 100);
    const values = Array.isArray(lastValue) ? lastValue : [];
    await handler.send("pagination", {
      page: { pageNum, pageSize },
      value: values.slice((pageNum - 1) * pageSize, pageNum * pageSize),
      count: values.length,
    });
  };
  handler.on("init", load);
  handler.on("refresh", load);
  handler.on("detail", load);
  handler.on("initStatus", loadStatus);
  handler.on("refreshStatus", loadStatus);
  handler.on("update", update);
  handler.on("saveItem", update);
  handler.on("createKey", createKey);
  handler.on("deleteLine", deleteLine);
  handler.on("changePage", changePage);
  handler.on("deleteConsumerGroup", async (content) => {
    try {
      const group = stringValue(record(content).name || record(content).group || content).trim();
      if (!group) throw new Error("Redis consumer group name is required");
      await execute(`XGROUP DESTROY ${JSON.stringify(key)} ${JSON.stringify(group)}`);
      await handler.send("success", `Consumer group ${group} deleted.`);
      await load();
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("ttl", async (content) => {
    try {
      const seconds = Number(record(content).ttl ?? content);
      if (!Number.isFinite(seconds)) throw new Error("Redis TTL must be a number");
      await execute(`EXPIRE ${JSON.stringify(key)} ${Math.max(0, Math.trunc(seconds))}`);
      await handler.send("success", "Redis TTL updated.");
      await load();
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("del", async () => {
    try {
      await execute(`DEL ${JSON.stringify(key)}`);
      await handler.send("success", "Redis key deleted.");
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("rename", async (content) => {
    try {
      const nextKey = stringValue(record(content).name || record(content).key || content).trim();
      if (!nextKey) throw new Error("Redis key name is empty");
      await execute(`RENAME ${JSON.stringify(key)} ${JSON.stringify(nextKey)}`);
      key = nextKey;
      await handler.send("success", `Redis key renamed to ${nextKey}.`);
      await load();
    } catch (error) { await sendError(handler, error); }
  });
}

function registerElasticsearchStatus(context: UtilityProtocolContext): void {
  const { handler, services, state } = context;
  const load = async (): Promise<void> => {
    try {
      const selected = targetConnection(state) || services.activeConnection.get();
      if (!selected) throw new Error("No Elasticsearch connection selected");
      const result = await services.connections.query<Record<string, unknown>>(
        selected,
        "GET /_cat/nodes?v=true&h=ip,name,master,heap.percent,disk.used,disk.total,cpu,load_5m,segments.count,segments.memory&format=json",
      );
      const rows = rowsOf(result);
      const nested = rows.length === 1 && Array.isArray(rows[0].value)
        ? rows[0].value.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item && typeof item === "object" && !Array.isArray(item)),
        )
        : rows;
      await handler.send("esStatus", elasticSearchStatusRows(nested));
    } catch (error) { await sendError(handler, error); }
  };
  handler.on("esStatus", load);
  handler.on("refresh_es_status", load);
  handler.on("init", load);
}

function registerForwarding(context: UtilityProtocolContext): void {
  const { handler, services, state } = context;
  let selectedServer = stringValue(targetConnection(state)?.id, "");
  const forwardingKey = (serverKey: string): string => `ssh.forwardings.${serverKey || "default"}`;
  const readList = (serverKey: string): ForwardEntry[] => services.state.get<ForwardEntry[]>(forwardingKey(serverKey), []);
  const emit = async (): Promise<void> => {
    const connections = connectionRecords(services.state.get("ssh.connections", services.state.get("mysql.connections", {})))
      .filter((item) => item.type === "SSH" || item.type === "SFTP")
      .map((item) => ({ key: item.id, name: item.name || item.id, host: item.host }));
    await handler.send("serverKey", selectedServer);
    await handler.send("serverList", connections);
    await handler.send("forwardList", readList(selectedServer).map((item) => ({
      ...item,
      status: services.forwarding.isActive(item.id) ? "running" : "stopped",
    })));
    await handler.send("name", connections.find((item) => item.key === selectedServer)?.name || selectedServer);
  };
  const save = async (content: unknown): Promise<void> => {
    const payload = record(content);
    const info = record(payload.info) as unknown as ForwardEntry;
    const current = readList(stringValue(payload.serverKey, selectedServer));
    const index = current.findIndex((item) => String(item.id ?? "") === String(info.id ?? ""));
    const next = [...current];
    const normalized: ForwardEntry = {
      ...info,
      id: info.id || `${Date.now()}`,
      localHost: info.localHost || "127.0.0.1",
      localPort: Number(info.localPort),
      remoteHost: String(info.remoteHost || "").trim(),
      remotePort: Number(info.remotePort),
    };
    if (!normalized.remoteHost) throw new Error("Remote host is required");
    if (index >= 0) next[index] = normalized;
    else next.push(normalized);
    await services.state.update(forwardingKey(stringValue(payload.serverKey, selectedServer)), next);
    await handler.send("success", "Port forwarding configuration saved.");
    await emit();
  };
  handler.on("init", emit);
  handler.on("initForward", emit);
  handler.on("reloadForward", emit);
  handler.on("selectServer", async (content) => {
    selectedServer = stringValue(content, selectedServer);
    await emit();
  });
  handler.on("add", save);
  handler.on("save", save);
  handler.on("patch", save);
  handler.on("remove", async (content) => {
    const id = stringValue(record(content).id, stringValue(content));
    await services.forwarding.stop(id);
    const next = readList(selectedServer).filter((item) => String(item.id ?? "") !== id);
    await services.state.update(forwardingKey(selectedServer), next);
    await emit();
  });
  handler.on("start", async (content) => {
    try {
      const id = stringValue(record(content).id, stringValue(content));
      const info = readList(selectedServer).find((item) => String(item.id ?? "") === id);
      const server = connectionRecords(services.state.get("ssh.connections", services.state.get("mysql.connections", {})))
        .find((item) => item.id === selectedServer);
      if (!info || !server || (server.type !== "SSH" && server.type !== "SFTP")) {
        throw new Error("Forwarding server or entry was not found");
      }
      await services.forwarding.start(server as SshConnectionOptions, {
        id,
        localHost: info.localHost,
        localPort: Number(info.localPort),
        remoteHost: String(info.remoteHost || ""),
        remotePort: Number(info.remotePort),
      });
      await handler.send("success", { action: "start", id });
      await emit();
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("stop", async (content) => {
    try {
      const id = stringValue(record(content).id, stringValue(content));
      await services.forwarding.stop(id);
      await handler.send("success", { action: "stop", id });
      await emit();
    } catch (error) {
      await sendError(handler, error);
    }
  });
}

function registerSshStatus(context: UtilityProtocolContext): void {
  const { handler, services, state } = context;
  const connection = (): SshConnectionOptions | undefined => {
    const selected = targetConnection(state) || services.activeConnection.get();
    return selected && (selected.type === "SSH" || selected.type === "SFTP")
      ? selected as SshConnectionOptions
      : undefined;
  };
  const run = async (command: string): Promise<string> => {
    const selected = connection();
    if (!selected) throw new Error("No SSH connection selected");
    const session = await services.ssh.open(selected);
    const result = await session.exec(command);
    return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  };
  const initialize = async (): Promise<void> => {
    try {
      await handler.send("serverType", "ssh");
      await handler.send("info", { system: await run("uname -a 2>/dev/null || ver") });
    } catch (error) { await sendError(handler, error); }
  };
  handler.on("init", initialize);
  handler.on("initMonitor", initialize);
  handler.on("cpu", async () => { try { await handler.send("cpu", { output: await run("top -bn1 2>/dev/null | head -5 || wmic cpu get loadpercentage") }); } catch (error) { await sendError(handler, error); } });
  handler.on("memory", async () => { try { await handler.send("memory", { output: await run("free -m 2>/dev/null || systeminfo") }); } catch (error) { await sendError(handler, error); } });
  handler.on("disk", async () => { try { await handler.send("disk", { output: await run("df -h 2>/dev/null || wmic logicaldisk get size,freespace,caption") }); } catch (error) { await sendError(handler, error); } });
  handler.on("network", async () => { try { await handler.send("network", { output: await run("ip -s link 2>/dev/null || ipconfig") }); } catch (error) { await sendError(handler, error); } });
  handler.on("processes", async (content) => { try { await handler.send("processes", { output: await run(`ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -${Math.max(2, Number(record(content).limit) || 20)}`) }); } catch (error) { await sendError(handler, error); } });
}

function registerStructureDiff(context: UtilityProtocolContext): void {
  const { handler, services } = context;
  type DiffReference = {
    readonly connection: ConnectionOptions;
    readonly database?: string;
    readonly schema?: string;
  };
  type DiffSide = {
    readonly connection?: ConnectionOptions;
    readonly database?: string;
    readonly schema?: string;
  };
  type DiffTable = {
    readonly name: string;
    readonly columns: Array<Record<string, unknown>>;
  };
  const references = new Map<string, DiffReference>();
  const connections = (): ConnectionOptions[] => {
    const stored = connectionRecords(services.state.get("mysql.connections", {}));
    const target = asConnection(targetRecord(context.state));
    if (target && !stored.some((item) => item.id === target.id)) stored.push(target);
    return stored;
  };
  const findConnection = (key: unknown): ConnectionOptions | undefined => {
    const direct = asConnection(key);
    if (direct) return direct;
    const value = stringValue(key);
    return references.get(value)?.connection || connections().find((item) => item.id === value);
  };
  const referenceFor = (key: unknown): DiffReference | undefined => {
    const value = stringValue(key);
    const reference = references.get(value);
    if (reference) return reference;
    const connection = findConnection(key);
    return connection ? { connection } : undefined;
  };
  const labelFromRow = (row: Record<string, unknown>): string => stringValue(
    row.label || row.name || row.Database || row.database || row.schema || row.SCHEMA_NAME,
  ).trim();
  const emitNodes = async (): Promise<void> => {
    await handler.send("nodes", connections().map((item) => ({
      label: item.name || item.id,
      key: item.id,
      dbType: item.type,
      name: item.name,
      host: item.host,
      port: item.port,
    })));
  };
  const initialize = async (): Promise<void> => {
    await handler.send("user", { isPay: true, source: "modern-source-recovery" });
    await emitNodes();
  };
  handler.onInit("structDiff", initialize);
  handler.on("getUser", initialize);
  handler.on("loadDB", async (content) => {
    try {
      const payload = record(content);
      const selected = findConnection(payload.key);
      if (!selected) throw new Error(`Connection not found: ${stringValue(payload.key)}`);
      const dialect = services.dialects.resolve(selected.type);
      const sql = dialect.showDatabases?.() || dialect.showSchemas?.() || "";
      const result = sql
        ? await services.connections.query<Record<string, unknown>>(selected, sql)
        : { rows: [], fields: [] };
      const dbList = rowsOf(result).map((row) => {
        const label = labelFromRow(row);
        const key = `${selected.id}::db::${label}`;
        references.set(key, { connection: selected, database: label });
        return { label, key };
      }).filter((item) => item.label);
      await handler.send(payload.isTarget ? "targetDB" : "sourceDB", { dbList, error: null });
    } catch (error) {
      await handler.send(record(content).isTarget ? "targetDB" : "sourceDB", { dbList: [], error: errorText(error) });
    }
  });
  handler.on("loadSchema", async (content) => {
    try {
      const payload = record(content);
      const reference = referenceFor(payload.dbKey);
      if (!reference) throw new Error(`Database not found: ${stringValue(payload.dbKey)}`);
      const selected = reference.connection;
      const dialect = services.dialects.resolve(selected.type);
      const sql = dialect.showSchemas?.(reference.database || selected.database) || dialect.showDatabases?.() || "";
      const result = sql
        ? await services.connections.query<Record<string, unknown>>(selected, sql)
        : { rows: [], fields: [] };
      const schemaList = rowsOf(result).map((row) => {
        const label = labelFromRow(row);
        const key = `${String(payload.dbKey)}::schema::${label}`;
        references.set(key, {
          connection: selected,
          database: reference.database,
          schema: label,
        });
        return { label, key };
      }).filter((item) => item.label);
      await handler.send(payload.isTarget ? "targetSchema" : "sourceSchema", { schemaList, error: null });
    } catch (error) {
      await handler.send(record(content).isTarget ? "targetSchema" : "sourceSchema", { schemaList: [], error: errorText(error) });
    }
  });
  const resolveSide = (value: unknown): DiffSide => {
    const candidate = record(value);
    const database = record(candidate.db);
    const schema = record(candidate.schemaNode);
    const reference = referenceFor(database.key || candidate.dbKey || candidate.connection);
    const connection = asConnection(candidate.connection)
      || reference?.connection
      || findConnection(candidate.connection);
    return {
      connection,
      database: stringValue(candidate.database || database.label || database.name || reference?.database).trim() || undefined,
      schema: stringValue(candidate.schema || schema.label || schema.name || reference?.schema).trim() || undefined,
    };
  };
  const tableName = (row: Record<string, unknown>): string => stringValue(
    row.name || row.table_name || row.TABLE_NAME || row.label,
  ).trim();
  const columnName = (row: Record<string, unknown>): string => stringValue(
    row.name || row.column_name || row.COLUMN_NAME || row.label,
  ).trim();
  const columnType = (row: Record<string, unknown>): string => stringValue(
    row.type || row.columnType || row.originType || row.data_type || row.DATA_TYPE || row.simpleType,
    "TEXT",
  ).trim();
  const tableScope = (side: DiffSide): string | null => side.schema || side.database || side.connection?.schema || side.connection?.database || null;
  const loadTables = async (side: DiffSide): Promise<DiffTable[]> => {
    if (!side.connection) throw new Error("Both structure-diff connections must be selected");
    const dialect = services.dialects.resolve(side.connection.type);
    const sql = dialect.showTables?.(tableScope(side));
    if (!sql) return [];
    const result = await services.connections.query<Record<string, unknown>>(side.connection, sql);
    const tables: DiffTable[] = [];
    for (const row of rowsOf(result)) {
      const name = tableName(row);
      if (!name) continue;
      const columnSql = dialect.showColumns?.(tableScope(side), name);
      const columns = columnSql
        ? rowsOf(await services.connections.query<Record<string, unknown>>(side.connection, columnSql))
        : [];
      tables.push({ name, columns });
    }
    return tables;
  };
  const qualifiedTable = (side: DiffSide, name: string): string => {
    const dialect = services.dialects.resolve(side.connection?.type || "MySQL");
    return side.schema ? `${dialect.quoteIdentifier(side.schema)}.${dialect.quoteIdentifier(name)}` : dialect.quoteIdentifier(name);
  };
  const columnDefinition = (side: DiffSide, row: Record<string, unknown>): string => {
    const dialect = services.dialects.resolve(side.connection?.type || "MySQL");
    const name = columnName(row);
    const nullable = String(row.nullable ?? row.is_nullable ?? row.IS_NULLABLE ?? "YES").toUpperCase() !== "NO";
    const defaultValue = row.defaultValue ?? row.default ?? row.column_default ?? row.COLUMN_DEFAULT;
    const defaultSql = defaultValue == null || defaultValue === "" ? "" : ` DEFAULT ${String(defaultValue)}`;
    return `${dialect.quoteIdentifier(name)} ${columnType(row)}${nullable ? "" : " NOT NULL"}${defaultSql}`;
  };
  const tableChildren = (table: DiffTable): Record<string, unknown> => ({
    columns: table.columns.map((row) => ({ name: columnName(row), detail: columnType(row), type: "column" })),
    keys: [],
  });
  const createTableSql = (side: DiffSide, table: DiffTable): string => {
    const columns = table.columns.map((row) => `  ${columnDefinition(side, row)}`);
    return `CREATE TABLE ${qualifiedTable(side, table.name)} (\n${columns.join(",\n")}\n);`;
  };
  const alterColumnSql = (side: DiffSide, table: string, column: Record<string, unknown>): string => {
    const dialect = services.dialects.resolve(side.connection?.type || "MySQL");
    const qualified = qualifiedTable(side, table);
    const definition = columnDefinition(side, column);
    if (["MySQL", "MariaDB", "ClickHouse", "Doris"].includes(side.connection?.type || "")) {
      return `ALTER TABLE ${qualified} MODIFY COLUMN ${definition};`;
    }
    if (["PostgreSQL", "Redshift", "Kingbase", "GaussDB", "Cockroach", "PostgreCompatible"].includes(side.connection?.type || "")) {
      return `ALTER TABLE ${qualified} ALTER COLUMN ${dialect.quoteIdentifier(columnName(column))} TYPE ${columnType(column)};`;
    }
    return `ALTER TABLE ${qualified} ALTER COLUMN ${definition};`;
  };
  const compareTables = async (source: DiffSide, target: DiffSide): Promise<Record<string, unknown>[]> => {
    const [sourceTables, targetTables] = await Promise.all([loadTables(source), loadTables(target)]);
    const targetByName = new Map(targetTables.map((table) => [table.name.toLowerCase(), table]));
    const sqlList: Record<string, unknown>[] = [];
    for (const sourceTable of sourceTables) {
      const targetTable = targetByName.get(sourceTable.name.toLowerCase());
      if (!targetTable) {
        sqlList.push({
          type: "add",
          sql: createTableSql(target, sourceTable),
          table: sourceTable.name,
          objectType: "table",
          children: tableChildren(sourceTable),
        });
        continue;
      }
      const targetColumns = new Map(targetTable.columns.map((row) => [columnName(row).toLowerCase(), row]));
      for (const sourceColumn of sourceTable.columns) {
        const name = columnName(sourceColumn);
        const targetColumn = targetColumns.get(name.toLowerCase());
        if (!targetColumn) {
          sqlList.push({
            type: "add",
            sql: `ALTER TABLE ${qualifiedTable(target, sourceTable.name)} ADD COLUMN ${columnDefinition(target, sourceColumn)};`,
            table: sourceTable.name,
            objectType: "column",
            name,
            detail: columnType(sourceColumn),
          });
        } else {
          const changed = columnType(sourceColumn).toLowerCase() !== columnType(targetColumn).toLowerCase()
            || String(sourceColumn.nullable ?? sourceColumn.is_nullable ?? "").toLowerCase() !== String(targetColumn.nullable ?? targetColumn.is_nullable ?? "").toLowerCase();
          if (changed) {
            sqlList.push({
              type: "change",
              sql: alterColumnSql(target, sourceTable.name, sourceColumn),
              table: sourceTable.name,
              objectType: "column",
              name,
              detail: columnType(sourceColumn),
            });
          }
        }
        targetColumns.delete(name.toLowerCase());
      }
      for (const [name, targetColumn] of targetColumns) {
        const dialect = services.dialects.resolve(target.connection?.type || "MySQL");
        sqlList.push({
          type: "remove",
          sql: `ALTER TABLE ${qualifiedTable(target, sourceTable.name)} DROP COLUMN ${dialect.quoteIdentifier(columnName(targetColumn))};`,
          table: sourceTable.name,
          objectType: "column",
          name,
          detail: columnType(targetColumn),
        });
      }
      targetByName.delete(sourceTable.name.toLowerCase());
    }
    for (const table of targetByName.values()) {
      sqlList.push({
        type: "remove",
        sql: `DROP TABLE ${qualifiedTable(target, table.name)};`,
        table: table.name,
        objectType: "table",
        children: tableChildren(table),
      });
    }
    return sqlList;
  };
  const compare = async (content: unknown): Promise<void> => {
    try {
      const payload = record(content);
      const fallback = { connection: targetConnection(context.state) || services.activeConnection.get() };
      const source = resolveSide(payload.from || fallback);
      const target = resolveSide(payload.to || fallback);
      const sqlList = await compareTables(source, target);
      await handler.setWebviewState({
        ...context.webviewState,
        sqlList,
        option: { from: payload.from || fallback, to: payload.to || fallback },
      });
      await handler.send("compareResult", {
        sqlList,
        option: { from: payload.from || fallback, to: payload.to || fallback },
      });
    } catch (error) {
      await sendError(handler, error);
    }
  };
  handler.on("start", compare);
  handler.on("compare", compare);
  handler.on("sync", async (content) => {
    try {
      const payload = record(content);
      const sqlList = (Array.isArray(payload.sqlList) ? payload.sqlList : [])
        .map((item) => stringValue(record(item).sql || item).trim())
        .filter(Boolean);
      if (sqlList.length === 0) throw new Error("No structure-diff SQL was selected");
      const option = record(payload.option);
      const destination = resolveSide(option.to || option.target || option.from);
      const connection = destination.connection || targetConnection(context.state) || services.activeConnection.get();
      if (!connection) throw new Error("No structure-diff destination connection selected");
      for (const sql of sqlList) await services.connections.query(connection, sql);
      await handler.send("syncSuccess");
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("openQuery", async (content) => {
    const payload = record(content);
    const statements = Array.isArray(payload.sqlList) ? payload.sqlList : Array.isArray(content) ? content : [];
    const sql = statements.map((item) => stringValue(record(item).sql || item)).join("\n\n");
    if (sql.trim()) {
      const document = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
      await vscode.window.showTextDocument(document);
    }
  });
}

export function registerWebviewUtilityProtocols(context: UtilityProtocolContext): void {
  if (context.route === "fileManager" || context.route === "sshTerminal") {
    registerRemoteFileManager(context);
  }
  if (context.route === "sshTerminal") registerSshTerminal(context);
  if (context.route === "mock") registerMock(context);
  if (context.route === "rabbitQueueView") registerRabbitQueue(context);
  if (context.route === "keyView") registerRedisKey(context);
  if (context.route === "esStatus") registerElasticsearchStatus(context);
  if (context.route === "forward") registerForwarding(context);
  if (context.route === "sshStatus" || context.route === "sshMonitor") registerSshStatus(context);
  if (context.route === "structDiff") registerStructureDiff(context);
}
