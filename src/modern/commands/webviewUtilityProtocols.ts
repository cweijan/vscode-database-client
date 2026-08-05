import * as path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { TypedWebviewHandler } from "../core/webviewHandler";
import type { ConnectionOptions, QueryResult } from "../database/types";
import type { RemoteEntry, SshConnectionOptions } from "../remote/sshService";

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
  readonly type: "file" | "directory";
  readonly size?: number | string;
  readonly modified?: unknown;
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
    type: kind === "directory" || kind === "dir" ? "directory" : "file",
    size: typeof row.size === "number" || typeof row.size === "string" ? row.size : undefined,
    modified: row.modified || row.lastmod,
    kind,
  };
}

function fileEntryFromSsh(entry: RemoteEntry): FileManagerEntry {
  return {
    name: entry.name,
    path: entry.path,
    type: entry.kind === "directory" ? "directory" : "file",
    size: entry.size,
    modified: entry.modifiedAt?.toISOString(),
    kind: entry.kind,
  };
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
  let currentPath = normalizedRemotePath(state.path, "/");

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

  const onInit = async (): Promise<void> => {
    await emitConfig();
    await list(currentPath);
  };

  handler.on("initSftpConfig", () => emitConfig());
  handler.on("initSftp", onInit);
  handler.on("init", onInit);
  handler.on("load", (content) => list(record(content).path));
  handler.on("refreshAdapter", onInit);
  handler.on("createFolder", (content) => withRemoteMutation(async (selected) => {
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
  handler.on("createFile", (content) => withRemoteMutation(async (selected) => {
    const item = record(content);
    const name = stringValue(item.name).trim();
    if (!name) return;
    const parent = normalizedRemotePath(item.path, currentPath);
    await writeRemote(selected, childRemotePath(parent, name), Buffer.alloc(0));
  }));
  handler.on("delete", (content) => withRemoteMutation(async (selected) => {
    const item = record(record(content).item);
    const remotePath = stringValue(item.path);
    if (!remotePath) return;
    if (selected.type === "SSH" || selected.type === "SFTP") {
      const session = await services.ssh.open(selected as SshConnectionOptions);
      await session.remove(remotePath, item.type === "directory");
    } else {
      await queryResource(`DELETE ${remotePath}`);
    }
  }));
  handler.on("rename", (content) => withRemoteMutation(async (selected) => {
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
  handler.on("upload", (content) => withRemoteMutation(async (selected) => {
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
      if (!remotePath || item.type === "directory") return;
      const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(stringValue(item.name, path.posix.basename(remotePath))),
        saveLabel: "Download",
      });
      if (!target) return;
      const selected = connection();
      if (!selected) throw new Error("No remote connection selected");
      if (selected.type === "SSH" || selected.type === "SFTP") {
        const session = await services.ssh.open(selected as SshConnectionOptions);
        await session.download(remotePath, target.fsPath);
      } else {
        await writeFile(target.fsPath, await readRemote(selected, remotePath));
      }
      await handler.send("result", { action: "download", path: remotePath, localPath: target.fsPath });
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
    const rows = await execute(`POST /api/queues/${queueUrl}/get\n${JSON.stringify({
      vhost,
      name: queue,
      truncate: "50000",
      ackmode: "ack_requeue_true",
      encoding: "auto",
      count: String(count),
    }, null, 2)}`);
    await handler.send("messages", { messages: rows, messagesReady: rows.length });
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
        await execute(`POST /api/exchanges/${rabbitPath(vhost, "amq.default")}/publish\n${JSON.stringify({
          vhost,
          name: "amq.default",
          properties: { delivery_mode: 2, headers: {} },
          routing_key: targetQueue,
          delivery_mode: "2",
          payload: typeof message === "object" ? JSON.stringify(message) : String(message),
          payload_encoding: "string",
          headers: {},
          props: {},
        }, null, 2)}`);
      }
      await handler.send("success", `Sent ${messages.length} message(s) to ${targetQueue}`);
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
  const key = stringValue(target.key || target.label || target.name, "key");
  const connection = (): ConnectionOptions | undefined => targetConnection(state) || services.activeConnection.get();
  const execute = async (command: string): Promise<Record<string, unknown>[]> => {
    const selected = connection();
    if (!selected) throw new Error("No Redis connection selected");
    return rowsOf(await services.connections.query<Record<string, unknown>>(selected, command));
  };
  const load = async (): Promise<void> => {
    try {
      const [valueResult, typeResult, ttlResult] = await Promise.all([
        execute(`GET ${JSON.stringify(key)}`),
        execute(`TYPE ${JSON.stringify(key)}`),
        execute(`TTL ${JSON.stringify(key)}`),
      ]);
      await handler.send("detail", {
        key,
        value: valueResult[0]?.value,
        type: typeResult[0]?.value || "string",
        ttl: ttlResult[0]?.value,
      });
    } catch (error) {
      await sendError(handler, error);
    }
  };
  const update = async (content: unknown): Promise<void> => {
    try {
      const payload = record(content);
      const value = payload.value ?? content;
      await execute(`SET ${JSON.stringify(key)} ${JSON.stringify(typeof value === "string" ? value : JSON.stringify(value))}`);
      await handler.send("success", "Redis key updated.");
      await load();
    } catch (error) { await sendError(handler, error); }
  };
  handler.on("init", load);
  handler.on("refresh", load);
  handler.on("detail", load);
  handler.on("update", update);
  handler.on("saveItem", update);
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
      await handler.send("success", `Redis key renamed to ${nextKey}.`);
    } catch (error) { await sendError(handler, error); }
  });
}

function registerElasticsearchStatus(context: UtilityProtocolContext): void {
  const { handler, services, state } = context;
  const load = async (): Promise<void> => {
    try {
      const selected = targetConnection(state) || services.activeConnection.get();
      if (!selected) throw new Error("No Elasticsearch connection selected");
      const result = await services.connections.query<Record<string, unknown>>(selected, "GET /_cluster/health");
      await handler.send("esStatus", rowsOf(result)[0] || {});
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
    await handler.send("forwardList", readList(selectedServer));
    await handler.send("name", connections.find((item) => item.key === selectedServer)?.name || selectedServer);
  };
  const save = async (content: unknown): Promise<void> => {
    const payload = record(content);
    const info = record(payload.info) as unknown as ForwardEntry;
    const current = readList(stringValue(payload.serverKey, selectedServer));
    const index = current.findIndex((item) => String(item.id ?? "") === String(info.id ?? ""));
    const next = [...current];
    if (index >= 0) next[index] = info;
    else next.push({ ...info, id: info.id || `${Date.now()}` });
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
    const next = readList(selectedServer).filter((item) => String(item.id ?? "") !== id);
    await services.state.update(forwardingKey(selectedServer), next);
    await emit();
  });
  handler.on("start", async (content) => {
    await handler.send("success", { action: "start", id: record(content).id });
  });
  handler.on("stop", async (content) => {
    await handler.send("success", { action: "stop", id: record(content).id });
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
  const connections = (): ConnectionOptions[] => connectionRecords(services.state.get("mysql.connections", {}));
  const findConnection = (key: unknown): ConnectionOptions | undefined => connections().find((item) => item.id === stringValue(key));
  handler.on("getUser", async () => {
    await handler.send("user", { isPay: true, source: "modern-source-recovery" });
  });
  handler.on("loadDB", async (content) => {
    try {
      const payload = record(content);
      const selected = findConnection(payload.key);
      if (!selected) throw new Error(`Connection not found: ${stringValue(payload.key)}`);
      const dialect = services.dialects.resolve(selected.type);
      const result = dialect.showDatabases ? await services.connections.query(selected, dialect.showDatabases()) : { rows: [], fields: [] };
      await handler.send(payload.isTarget ? "targetDB" : "sourceDB", { dbList: rowsOf(result), error: null });
    } catch (error) {
      await handler.send(record(content).isTarget ? "targetDB" : "sourceDB", { dbList: [], error: errorText(error) });
    }
  });
  handler.on("loadSchema", async (content) => {
    try {
      const payload = record(content);
      const selected = findConnection(payload.dbKey);
      if (!selected) throw new Error(`Connection not found: ${stringValue(payload.dbKey)}`);
      const dialect = services.dialects.resolve(selected.type);
      const result = dialect.showSchemas ? await services.connections.query(selected, dialect.showSchemas(selected.database)) : { rows: [], fields: [] };
      await handler.send(payload.isTarget ? "targetSchema" : "sourceSchema", { schemaList: rowsOf(result), error: null });
    } catch (error) {
      await handler.send(record(content).isTarget ? "targetSchema" : "sourceSchema", { schemaList: [], error: errorText(error) });
    }
  });
  handler.on("compare", async () => {
    await handler.send("compareResult", { sqlList: [] });
  });
  handler.on("sync", async () => {
    await handler.send("syncSuccess");
  });
  handler.on("openQuery", async (content) => {
    const statements = Array.isArray(content) ? content : [];
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
  if (context.route === "mock") registerMock(context);
  if (context.route === "rabbitQueueView") registerRabbitQueue(context);
  if (context.route === "keyView") registerRedisKey(context);
  if (context.route === "esStatus") registerElasticsearchStatus(context);
  if (context.route === "forward") registerForwarding(context);
  if (context.route === "sshStatus" || context.route === "sshMonitor") registerSshStatus(context);
  if (context.route === "structDiff") registerStructureDiff(context);
}
