import * as path from "node:path";
import * as os from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { TypedWebviewHandler } from "../core/webviewHandler";
import type {
  ConnectionOptions,
  MetadataQueryExecutor,
  QueryOptions,
  QueryResult,
} from "../database/types";
import { asConnectionOptions } from "../database/connectionOptions";
import { loadErDiagram, type ErDiagramData } from "../database/erDiagramService";
import {
  normalizeMockModel,
  type MockModel,
} from "../database/mockModel";
import {
  isDumpSupported,
  normalizeDumpConfig,
} from "../database/dumpService";
import type { DumpConfig } from "../database/dumpService";
import { loadDatabaseDashboard, isMysql, isPostgres } from "../database/statusService";
import type { RemoteEntry, SshConnectionOptions, SshSession } from "../remote/sshService";
import type { SshForwardType } from "../remote/sshForwardingService";
import { fetchSshMonitorSnapshot } from "../remote/sshMonitorService";
import {
  boundRemotePath,
  childRemotePath,
  normalizeRemotePath,
  parentRemotePath,
} from "../remote/remotePaths";
import { decodeImageDataUrl } from "../core/imageService";
import {
  buildRedisItemCommands,
  normalizeRedisConsumerGroups,
} from "../database/redisValues";

export interface UtilityProtocolContext {
  readonly route: string;
  readonly target?: unknown;
  readonly state: Record<string, unknown>;
  readonly webviewState: Record<string, unknown>;
  readonly services: ExtensionServices;
  readonly handler: TypedWebviewHandler;
  readonly openUtility?: (route: string, title: string, target?: unknown) => Promise<unknown>;
  readonly openConnectionConfig?: (workspace?: boolean) => Promise<unknown>;
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

function normalizedDocumentationHost(value: unknown): string {
  return stringValue(value).trim().replace(/\/+$/, "");
}

function registerDocument(context: UtilityProtocolContext): void {
  const emitResourceHost = async (): Promise<void> => {
    const stateHost = context.webviewState.resourceHost ?? context.state.resourceHost;
    const resourceServerHost = await context.services.resourceServer.getHost();
    const host = normalizedDocumentationHost(
      typeof stateHost === "string"
        ? stateHost
        : resourceServerHost || context.services.config.get("documentationHost"),
    );
    if (!host) {
      await context.handler.send("error", {
        message: "Documentation host is not configured.",
      });
      return;
    }
    await context.handler.send("resourceHost", {
      host,
      language: vscode.env.language || "en",
    });
  };

  context.handler.on("resourceHost", emitResourceHost);
  context.handler.onInit("document", emitResourceHost);
}

interface MockColumn {
  readonly name: string;
  readonly type: string;
  readonly value: string;
  readonly nullable: boolean;
  readonly isIndex?: boolean;
}

interface ForwardEntry {
  readonly id?: string | number | null;
  readonly name?: string;
  readonly type?: SshForwardType;
  readonly autoStartUp?: boolean;
  readonly keepAlive?: boolean;
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

function forwardType(value: unknown): SshForwardType {
  return value === "Remote" || value === "Dynamic" ? value : "Local";
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
  return asConnectionOptions(value);
}

function targetConnection(value: unknown): ConnectionOptions | undefined {
  const candidate = record(value);
  return asConnection(value)
    || asConnection(candidate.connection)
    || asConnection(candidate.target)
    || asConnection(candidate.options);
}

function targetRecord(state: Record<string, unknown>): Record<string, unknown> {
  return record(state.target);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = stringValue(value).trim();
    if (text) {
      return text;
    }
  }
  return undefined;
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

function registerCloudPage(context: UtilityProtocolContext): void {
  if (context.route !== "plan" && context.route !== "console") return;
  const { handler, services } = context;

  const sendUser = async (): Promise<void> => {
    await handler.send("user", services.cloud.getUser());
  };
  const sendOptions = async (): Promise<void> => {
    await handler.send("options", { options: await services.settings.list() });
  };
  const openSite = async (value: unknown): Promise<void> => {
    const source = typeof value === "string" ? value.trim() : "";
    if (!source) return;
    const host = vscode.env.language.toLowerCase() === "zh-cn"
      ? "https://zh.database-client.com"
      : "https://database-client.com";
    const url = /^https?:\/\//i.test(source) ? source : `${host}/${source.replace(/^\/+/, "")}`;
    await vscode.env.openExternal(vscode.Uri.parse(url));
  };
  const storedConnectionCount = (): number => {
    const ids = new Set<string>();
    for (const key of ["database.connections", "nosql.connections"]) {
      for (const connection of connectionRecords(services.state.get(key, {}))) {
        ids.add(connection.id);
      }
    }
    return ids.size;
  };

  handler.onInit(context.route, async () => {
    await sendUser();
    await handler.send("syncKey", services.cloud.getSyncKey());
    await handler.send("email", services.cloud.getEmail());
    await handler.send("appName", vscode.env.appName);
  });

  handler.on("getEmail", async () => {
    await handler.send("email", services.cloud.getEmail());
  });
  handler.on("saveEmail", (content) => services.cloud.saveEmail(content));
  handler.on("bindUser", async (content) => {
    try {
      await services.cloud.setUser(content);
      await sendUser();
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("getUser", sendUser);
  handler.on("login", async (content) => {
    const payload = record(content);
    try {
      const user = await services.cloud.login(
        stringValue(payload.email).trim(),
        stringValue(payload.password),
      );
      await handler.send("user", user);
      await handler.send("loginRes", { errMsg: undefined });
    } catch (error) {
      await handler.send("loginRes", { errMsg: errorText(error) });
    }
  });
  handler.on("copyMachineId", async () => {
    await vscode.env.clipboard.writeText(services.cloud.getMachineId());
    await vscode.window.showInformationMessage("The machine ID has been copied to the clipboard.");
  });
  handler.on("license", async (content) => {
    try {
      const user = await services.cloud.bindLicense(stringValue(content));
      if (user) {
        await handler.send("user", user);
        await handler.send("boundLicense", user);
      }
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("open", (content) => openSite(content));
  handler.on("openSite", (content) => openSite(content));
  handler.on("loginOnBrowser", () => openSite("login"));
  handler.on("resourceHost", async () => {
    const host = await services.resourceServer.getHost()
      || services.config.get("documentationHost");
    await handler.send("resourceHost", {
      host,
      language: vscode.env.language || "en",
    });
  });
  handler.on("payNotice", async () => {
    if (context.route !== "plan" && context.openUtility) {
      await context.openUtility("plan", "Plan");
    }
  });

  if (context.route !== "console") return;
  handler.on("options", () => sendOptions());
  handler.on("updateOption", async (content) => {
    try {
      const payload = record(content);
      await services.settings.update({
        name: stringValue(payload.name),
        value: payload.value,
        type: stringValue(payload.type, typeof payload.value),
      });
      await handler.send("configSuccess", "Configuration updated.");
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("resetOption", async (content) => {
    try {
      const options = Array.isArray(content)
        ? content.map((item) => ({ name: stringValue(record(item).name) }))
        : [];
      await services.settings.reset(options);
      await handler.send("resetSuccess", "Reset to default settings.");
      await sendOptions();
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("openMoreSettings", (content) => services.settings.openMoreSettings(content));
  handler.on("editConfig", async (content) => {
    const payload = record(content);
    const workspace = content === true || payload.workspace === true;
    if (context.openConnectionConfig) {
      await context.openConnectionConfig(workspace);
      return;
    }
    await services.settings.openMoreSettings(content === true ? undefined : content);
  });
  handler.on("exportConfig", async (content) => {
    try {
      const payload = record(content);
      const exported = await services.connectionConfig.exportConfig(
        payload.workspace === true,
        payload.withQueryFiles === true,
      );
      if (exported) await handler.send("configSuccess", "Configuration exported.");
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("importConfig", async (content) => {
    try {
      const payload = record(content);
      const workspace = payload.workspace === true;
      const type = payload.type === "merge" ? "merge" : "";
      if (payload.confirm !== true && type !== "merge" && storedConnectionCount() > 0) {
        await handler.send(workspace ? "importWorkspaceConfirm" : "importConfirm");
        return;
      }
      const imported = await services.connectionConfig.importConfig(type, workspace);
      await handler.send("importResult", {
        success: imported,
        cancel: !imported,
        message: imported ? "Imported connection configuration." : "No configuration was imported.",
      });
      await sendOptions();
    } catch (error) {
      await handler.send("importResult", { success: false, message: errorText(error) });
    }
  });
  handler.on("closeAllConnections", async () => {
    try {
      const confirmed = await vscode.window.showWarningMessage(
        "Close all database connections?",
        { modal: true },
        "Close all",
      );
      if (confirmed !== "Close all") return;
      await services.connections.closeAll();
      services.activeConnection.clear();
      await handler.send("success", "Close all connections success!");
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("clearCache", async () => {
    await services.cache.clear();
    await vscode.window.showInformationMessage("Clear cache success!");
    await handler.send("success", "Clear cache success!");
  });
  handler.on("chooseSyncKey", async () => {
    const files = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), ".ssh")),
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: "Choose sync key",
    });
    const selected = files?.[0];
    if (!selected) return;
    await services.cloud.setSyncKey(selected.fsPath);
    await handler.send("syncKey", selected.fsPath);
  });
  handler.on("uploadConfig", async (content) => {
    let success = true;
    let message = "Upload config success!";
    try {
      const payload = record(content);
      const keyPath = stringValue(payload.keyPath || content, services.cloud.getSyncKey());
      await services.cloud.setSyncKey(keyPath);
      const size = await services.cloudSync.upload(keyPath);
      message = `Upload config success! (${size} bytes)`;
    } catch (error) {
      success = false;
      message = errorText(error);
    }
    await handler.send("uploadRes", { success, message });
  });
  handler.on("removeConfig", async () => {
    let success = true;
    let message = "Cloud configuration removed.";
    try {
      await services.cloudSync.remove();
    } catch (error) {
      success = false;
      message = errorText(error);
    }
    await handler.send("removeRes", { success, message });
  });
  handler.on("downloadConfig", async (content) => {
    const payload = record(content);
    const keyPath = stringValue(payload.keyPath, services.cloud.getSyncKey());
    const type = payload.type === "merge" ? "merge" : "";
    if (payload.confirm !== true && type !== "merge" && storedConnectionCount() > 0) {
      await handler.send("downloadConfirm");
      return;
    }
    let success = true;
    let message = "Download config success!";
    try {
      await services.cloud.setSyncKey(keyPath);
      const result = await services.cloudSync.download({ keyPath, type });
      message = `Download config success! (${result.settings} settings, ${result.state} state entries, ${result.files} files)`;
    } catch (error) {
      success = false;
      message = errorText(error);
    }
    await handler.send("downloadResult", { success, message });
    if (success) await sendOptions();
  });
}

function registerImage(context: UtilityProtocolContext): void {
  if (context.route !== "image") return;
  const { handler, services } = context;
  const sendTinyPngStatus = async (): Promise<void> => {
    await handler.send("tinyPngApiKeyStatus", services.tinyPng.getStatus());
  };

  handler.onInit("image", sendTinyPngStatus);
  handler.on("getTinyPngApiKey", sendTinyPngStatus);
  handler.on("saveTinyPngApiKey", async (content) => {
    try {
      await handler.send("tinyPngApiKeyStatus", await services.tinyPng.setApiKey(content));
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("compressTinyPng", async (content) => {
    try {
      const result = await services.tinyPng.compress(record(content).dataUrl);
      await handler.send("compressTinyPngResult", { success: true, ...result });
    } catch (error) {
      await handler.send("compressTinyPngResult", {
        success: false,
        message: errorText(error),
      });
    }
  });
  handler.on("saveImageFile", async (content) => {
    try {
      const payload = record(content);
      const image = decodeImageDataUrl(payload.dataUrl);
      if (!image) throw new Error("Invalid image data");
      const file = await vscode.window.showSaveDialog({
        saveLabel: "Save image",
        defaultUri: vscode.Uri.file(
          stringValue(payload.fileName, `image-${Date.now()}.${image.extension}`),
        ),
        filters: { Images: ["png", "jpg", "jpeg", "webp", "gif"] },
      });
      if (file) await vscode.workspace.fs.writeFile(file, image.bytes);
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("saveSvgFile", async (content) => {
    try {
      const payload = record(content);
      const source = stringValue(payload.content);
      if (!source.trim()) throw new Error("SVG content is empty");
      const file = await vscode.window.showSaveDialog({
        saveLabel: "Save SVG",
        defaultUri: vscode.Uri.file(stringValue(payload.fileName, `image-${Date.now()}.svg`)),
        filters: { SVG: ["svg"] },
      });
      if (file) await vscode.workspace.fs.writeFile(file, Buffer.from(source, "utf8"));
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("telemetry", (content) => {
    services.logger.debug("Image tool telemetry", content);
  });
}

interface ManagerCapabilities {
  readonly log: boolean;
  readonly dashBoard: boolean;
  readonly processList: boolean;
  readonly hasAnyMonitor: boolean;
  readonly dump: boolean;
  readonly structDiff: boolean;
}

async function emitDatabaseClientLog(handler: TypedWebviewHandler): Promise<void> {
  const outputPath = path.join(os.homedir(), ".dbclient", "storage", "output.bin-log");
  try {
    const content = await readFile(outputPath, "utf8");
    const lines = content.split(/\r?\n/);
    await handler.send("data", "\x1Bc");
    await handler.send("data", lines.slice(-500).join("\n"));
  } catch {
    // The target keeps the log terminal empty until the first output file exists.
  }
}

function managerConnection(context: UtilityProtocolContext): ConnectionOptions | undefined {
  return targetConnection(context.webviewState.connection)
    || targetConnection(context.state.connection)
    || targetConnection(context.target)
    || context.services.activeConnection.get();
}

function managerCapabilities(connection: ConnectionOptions | undefined, context: UtilityProtocolContext): ManagerCapabilities {
  if (!connection) {
    return {
      log: false,
      dashBoard: false,
      processList: false,
      hasAnyMonitor: false,
      dump: false,
      structDiff: false,
    };
  }
  let processList = false;
  try {
    processList = Boolean(context.services.dialects.resolve(connection.type).processList?.());
  } catch {
    processList = false;
  }
  const sqlDatabase = isMysql(connection.type) || isPostgres(connection.type);
  return {
    log: Boolean(connection),
    dashBoard: sqlDatabase,
    processList,
    hasAnyMonitor: sqlDatabase || processList,
    dump: isDumpSupported(connection.type),
    structDiff: sqlDatabase,
  };
}

function managerInfo(connection: ConnectionOptions | undefined): Record<string, unknown> {
  if (!connection) return { dbType: undefined };
  const { password: _password, ...safeConnection } = connection;
  return {
    ...safeConnection,
    dbType: connection.type,
  };
}

function registerManager(context: UtilityProtocolContext): void {
  if (context.route !== "manager") return;
  const { handler, services } = context;

  const connection = (): ConnectionOptions | undefined => managerConnection(context);
  registerTerminalUiProtocols(context, () => connection()?.type || "SSH");
  handler.on("initTerminal", async () => {
    await emitDatabaseClientLog(handler);
  });

  const sendInfo = async (): Promise<ConnectionOptions | undefined> => {
    const selected = connection();
    const capabilities = managerCapabilities(selected, context);
    await handler.send("info", {
      ...managerInfo(selected),
      monitorStatus: capabilities,
    });
    await handler.send("dbType", selected?.type);
    await handler.send("monitorStatus", capabilities);
    await handler.send("user", services.cloud.getUser());
    return selected;
  };

  const sendProcessList = async (): Promise<void> => {
    const connection = managerConnection(context);
    if (!connection) throw new Error("No database connection selected");
    const dialect = services.dialects.resolve(connection.type);
    const sql = dialect.processList?.();
    if (!sql) throw new Error(`Process list is not supported for ${connection.type}`);
    const result = await services.connections.query(connection, sql);
    await handler.send("processList", {
      fields: result.fields,
      rows: result.rows,
      supportKill: typeof dialect.kill === "function",
    });
  };

  handler.onInit("manager", async () => {
    await sendInfo();
    if (context.webviewState.openDump === true) await handler.send("open_dump");
  });
  handler.on("processList", async () => {
    try {
      await sendProcessList();
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("killProcess", async (content) => {
    try {
      const connection = managerConnection(context);
      if (!connection) throw new Error("No database connection selected");
      const dialect = services.dialects.resolve(connection.type);
      const sql = dialect.kill?.(record(content));
      if (!sql) throw new Error(`Process termination is not supported for ${connection.type}`);
      await services.connections.query(connection, sql);
      await sendProcessList();
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("dashBoard", async () => {
    try {
      const selected = connection();
      if (!selected) throw new Error("No database connection selected");
      const dashboard = await loadDatabaseDashboard(
        selected.type,
        (sql) => services.connections.query(selected, sql),
      );
      await handler.send("dashBoard", dashboard);
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("dumpInit", async () => {
    try {
      const connection = managerConnection(context);
      if (!connection) throw new Error("No database connection selected");
      await handler.send("dumpInit", await services.dump.initialize(connection));
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("dumpChoose", async (content) => {
    try {
      const event = stringValue(record(content).event);
      if (event !== "executable" && event !== "output") return;
      if (event === "executable") {
        const files = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: "Select dump executable",
        });
        const file = files?.[0];
        if (file) await handler.send("dumpChoose", { event, path: file.fsPath });
      } else {
        const file = await vscode.window.showSaveDialog({
          saveLabel: "Select dump output",
          filters: { SQL: ["sql"] },
        });
        if (file) await handler.send("dumpChoose", { event, path: file.fsPath });
      }
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("installDependency", async (content) => {
    try {
      const connection = managerConnection(context);
      if (!connection) throw new Error("No database connection selected");
      const requested = typeof content === "string"
        ? content
        : stringValue(record(content).command || record(content).dependency);
      const executable = await services.dump.findExecutable(connection, requested || undefined);
      if (executable) {
        await handler.send("dumpChoose", { event: "executable", path: executable });
        await handler.send("dependencyStatus", { installed: true, path: executable });
        return;
      }
      const command = isPostgres(connection.type) ? "pg_dump" : connection.type === "MariaDB" ? "mariadb-dump" : "mysqldump";
      await handler.send("dependencyStatus", {
        installed: false,
        command,
        message: `${command} was not found on PATH. Install the database client and try again.`,
      });
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("dumpRun", async (content) => {
    try {
      const connection = managerConnection(context);
      if (!connection) throw new Error("No database connection selected");
      const config: DumpConfig = normalizeDumpConfig(connection, content);
      const result = await services.dump.run(connection, config);
      await handler.send("dumpResult", result);
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("refreshManager", async () => { await sendInfo(); });
}

function registerUtility(context: UtilityProtocolContext): void {
  if (context.route !== "util") return;
  const { handler, services } = context;

  handler.onInit("util", async () => {
    await handler.send("randomValue", services.utility.randomValue());
  });
  handler.on("computeValue", async (content) => {
    try {
      await handler.send("computedValue", services.utility.computeValue(stringValue(content)));
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("getRandom", async () => {
    await handler.send("randomValue", services.utility.randomValue());
  });
  handler.on("getSystemProcesses", async () => {
    try {
      await handler.send("systemProcesses", await services.utility.listProcesses());
    } catch (error) {
      await handler.send("systemProcessError", { message: errorText(error) });
    }
  });
  handler.on("killSystemProcess", async (content) => {
    try {
      const pid = await services.utility.killProcess(record(content).pid);
      await handler.send("systemProcessKilled", {
        pid,
        message: `Ended process ${pid}`,
      });
    } catch (error) {
      await handler.send("systemProcessError", {
        pid: Number(record(content).pid) || 0,
        message: errorText(error),
      });
    }
  });
  handler.on("telemetry", (content) => {
    services.logger.debug("Utility telemetry", content);
  });
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
  const rootPath = normalizeRemotePath(
    webviewState.rootPath || state.rootPath || targetRecord(state).rootPath,
    "/",
  );
  let currentPath = boundRemotePath(webviewState.path || state.path, rootPath);

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
      rootPath,
      currentPath,
    });
  };

  const list = async (requestedPath?: unknown): Promise<void> => {
    const selected = connection();
    if (requestedPath != null) {
      currentPath = boundRemotePath(requestedPath, rootPath);
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
      const remoteChild = boundRemotePath(
        stringValue(remoteEntry.path, childRemotePath(remotePath, name)),
        rootPath,
      );
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
  handler.on("copyText", async (content) => {
    try {
      const value = stringValue(record(content).value || content).trim();
      if (!value) return;
      await vscode.env.clipboard.writeText(value);
      await handler.send("result", { action: "copyText" });
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("createFolder", (content) => safeRemoteMutation(async (selected) => {
    const item = record(content);
    const name = stringValue(item.name).trim();
    if (!name) return;
    const parent = boundRemotePath(item.path, rootPath);
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
    const parent = boundRemotePath(item.path, rootPath);
    await writeRemote(selected, childRemotePath(parent, name), Buffer.alloc(0));
  }));
  handler.on("delete", (content) => safeRemoteMutation(async (selected) => {
    const item = record(record(content).item);
    const remotePath = boundRemotePath(item.path, rootPath);
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
    const remotePath = boundRemotePath(item.path, rootPath);
    const newName = stringValue(payload.newName).trim();
    if (!remotePath || !newName) return;
    const newPath = boundRemotePath(childRemotePath(parentRemotePath(remotePath), newName), rootPath);
    if (selected.type === "SSH" || selected.type === "SFTP") {
      const session = await services.ssh.open(selected as SshConnectionOptions);
      await session.rename(remotePath, newPath);
    } else {
      await queryResource(`RENAME ${remotePath}\n${newPath}`);
    }
  }));
  handler.on("upload", (content) => safeRemoteMutation(async (selected) => {
    const parent = boundRemotePath(record(content).path, rootPath);
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
      const remotePath = boundRemotePath(item.path, rootPath);
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
      const remotePath = boundRemotePath(item.path, rootPath);
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
      const remotePath = boundRemotePath(item.path, rootPath);
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
  const { handler, services, state, openUtility } = context;
  let channel: Awaited<ReturnType<SshSession["shell"]>> | undefined;
  let opening: Promise<void> | undefined;
  const selected = (): SshConnectionOptions | undefined => {
    const connection = targetConnection(state) || services.activeConnection.get();
    return connection && (connection.type === "SSH" || connection.type === "SFTP")
      ? connection as SshConnectionOptions
      : undefined;
  };
  if (context.route === "sshTerminal") {
    registerTerminalUiProtocols(context, () => selected()?.type || "SSH");
  }
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
      const initialPath = normalizeRemotePath(
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
  const closeChannel = (): void => {
    channel?.end();
    channel = undefined;
  };
  handler.on("initTerminal", async (content) => {
    try {
      if (record(content).reconnect === true) {
        closeChannel();
      }
      await open();
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("input", async (content) => {
    try {
      await open();
      const value = typeof content === "string" ? content : stringValue(record(content).data || content);
      channel?.write(value);
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("data", async (content) => {
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
      if (channel && "setWindow" in channel && typeof channel.setWindow === "function") {
        channel.setWindow(String(rows), String(cols), "0", "0");
      }
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("editInVSCode", async (content) => {
    try {
      const remotePath = stringValue(content).trim();
      const connection = selected();
      if (!remotePath || !connection) {
        throw new Error("A remote SSH file is required");
      }
      const session = await services.ssh.open(connection);
      const document = await vscode.workspace.openTextDocument({
        content: (await session.readFile(remotePath)).toString("utf8"),
        language: languageForFile(path.posix.basename(remotePath)),
      });
      const saveSubscription = vscode.workspace.onDidSaveTextDocument((saved) => {
        if (saved.uri.toString() !== document.uri.toString()) return;
        void session.writeFile(remotePath, Buffer.from(saved.getText(), "utf8"))
          .catch((error) => { void sendError(handler, error); });
      });
      const closeSubscription = vscode.workspace.onDidCloseTextDocument((closed) => {
        if (closed.uri.toString() !== document.uri.toString()) return;
        saveSubscription.dispose();
        closeSubscription.dispose();
      });
      await vscode.window.showTextDocument(document);
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("openSettings", () => services.settings.openMoreSettings());
  handler.on("duplicateTab", async () => {
    try {
      const connection = selected();
      if (!connection || !openUtility) return;
      await openUtility(
        "sshTerminal",
        `${connection.name || connection.id} · SSH Terminal`,
        { connection, path: normalizeRemotePath(state.path || record(state.target).path, "/") },
      );
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("closeTerminal", closeChannel);
  handler.onDidReset(closeChannel);
  handler.onDidDispose(closeChannel);
}

type TerminalOptionKey =
  | "fontSize"
  | "lineHeight"
  | "cursorStyle"
  | "cursorBlinking"
  | "scrollback"
  | "fontFamily";

function isTerminalOptionKey(value: string): value is TerminalOptionKey {
  return ["fontSize", "lineHeight", "cursorStyle", "cursorBlinking", "scrollback", "fontFamily"]
    .includes(value);
}

function registerTerminalUiProtocols(
  context: UtilityProtocolContext,
  databaseType: () => string,
): void {
  const { handler } = context;
  const emitDatabaseType = async (): Promise<void> => {
    await handler.send("dbType", databaseType());
  };
  const emitTerminalConfig = async (): Promise<void> => {
    const terminal = vscode.workspace.getConfiguration("terminal.integrated");
    const editor = vscode.workspace.getConfiguration("editor");
    const configuredFontFamily = terminal.get<string>("fontFamily")
      || editor.get<string>("fontFamily")
      || "";
    const fontFamily = configuredFontFamily
      ? `${configuredFontFamily}, Menlo, Monaco, Consolas, 'Courier New', monospace`
      : "Menlo, Monaco, Consolas, 'Courier New', monospace";
    await handler.send("terminalConfig", {
      dbType: databaseType(),
      fontSize: terminal.get<number>("fontSize"),
      fontFamily,
      lineHeight: terminal.get<number | string>("lineHeight"),
      cursorStyle: terminal.get<string>("cursorStyle"),
      cursorBlinking: terminal.get<boolean>("cursorBlinking"),
      scrollback: terminal.get<number>("scrollback"),
    });
  };

  handler.onInit(context.route, emitDatabaseType);
  handler.on("terminalConfig", emitTerminalConfig);
  handler.on("updateOption", async (content) => {
    try {
      const payload = record(content);
      const key = stringValue(payload.key).trim();
      if (!isTerminalOptionKey(key)) {
        throw new Error(`Unsupported terminal option: ${key || "(empty)"}`);
      }
      await vscode.workspace.getConfiguration("terminal.integrated").update(
        key,
        payload.value,
        vscode.ConfigurationTarget.Global,
      );
      await emitTerminalConfig();
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("openLink", async (content) => {
    try {
      const value = stringValue(content).trim();
      if (!/^https?:\/\//i.test(value)) {
        throw new Error("Only HTTP and HTTPS terminal links can be opened");
      }
      await vscode.env.openExternal(vscode.Uri.parse(value));
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("openFontSetting", async () => {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      { query: "@id:terminal.integrated.fontFamily" },
    );
  });
}

function registerXterm(context: UtilityProtocolContext): void {
  const { handler, state, services } = context;
  const connection = (): ConnectionOptions | undefined =>
    targetConnection(state) || services.activeConnection.get();

  registerTerminalUiProtocols(context, () => connection()?.type || "SSH");
  handler.on("editInVSCode", async (content) => {
    try {
      const remotePath = stringValue(content).trim();
      const selected = connection();
      if (!remotePath || !selected || (selected.type !== "SSH" && selected.type !== "SFTP")) {
        throw new Error("Editing a terminal path requires an SSH or SFTP connection");
      }
      const session = await services.ssh.open(selected as SshConnectionOptions);
      const document = await vscode.workspace.openTextDocument({
        content: (await session.readFile(remotePath)).toString("utf8"),
        language: languageForFile(path.posix.basename(remotePath)),
      });
      const saveSubscription = vscode.workspace.onDidSaveTextDocument((saved) => {
        if (saved.uri.toString() !== document.uri.toString()) return;
        void session.writeFile(remotePath, Buffer.from(saved.getText(), "utf8"))
          .catch((error) => sendError(handler, error));
      });
      const closeSubscription = vscode.workspace.onDidCloseTextDocument((closed) => {
        if (closed.uri.toString() !== document.uri.toString()) return;
        saveSubscription.dispose();
        closeSubscription.dispose();
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
    mockValueReference: "http://mockjs.com/examples.html#DPD",
    mock: Object.fromEntries(columns.map((column) => [
      column.name,
      { type: column.type, value: column.value, nullable: column.nullable },
    ])),
  };
  if (reset) return defaults;
  const saved = services.state.get<Record<string, unknown>>("mysql.mock.models", {});
  const cached = normalizeMockModel(saved[mockKey(state)]);
  return cached?.table === table ? cached : defaults;
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
  handler.onInit("mock", () => load(webviewState.resetMock === true));
  handler.on("saveMock", async (content) => {
    try {
      const model = normalizeMockModel(content);
      if (!model) throw new Error("Invalid Mock model");
      await saveMockModel(state, services, model);
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("resetMock", () => load(true));
  handler.on("runMock", async (content) => {
    try {
      const model = normalizeMockModel(content);
      if (!model) throw new Error("Invalid Mock model");
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
  registerTerminalUiProtocols(context, () => targetConnection(state)?.type || "Redis");
  const target = targetRecord(state);
  let newKey = target.newKey === true;
  let key = stringValue(target.key || target.label || target.name);
  let redisType = stringValue(target.type, "string");
  let lastValue: unknown;
  let terminalInput = "";
  let terminalReady = false;
  const connection = (): ConnectionOptions | undefined => targetConnection(state) || services.activeConnection.get();
  const execute = async (command: string): Promise<Record<string, unknown>[]> => {
    const selected = connection();
    if (!selected) throw new Error("No Redis connection selected");
    return rowsOf(await services.connections.query<Record<string, unknown>>(selected, command));
  };
  const valueOf = async (command: string): Promise<unknown> => (await execute(command))[0]?.value;
  const terminalPrompt = (): string => {
    const selected = connection();
    const host = selected?.host || selected?.name || "redis";
    const port = selected?.port || 6379;
    return `${host}:${port}> `;
  };
  const terminalValue = (value: unknown): string => {
    if (value == null) return "(nil)";
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, null, 2) || "(nil)"; } catch { return String(value); }
  };
  const terminalRows = (rows: readonly Record<string, unknown>[]): string => {
    if (rows.length === 0) return "(nil)";
    if (rows.length === 1 && "value" in rows[0]) return terminalValue(rows[0].value);
    return terminalValue(rows.length === 1 ? rows[0] : rows);
  };
  const initializeTerminal = async (): Promise<void> => {
    terminalInput = "";
    terminalReady = true;
    await handler.send("data", `\x1bc${terminalPrompt()}`);
  };
  const processTerminalInput = async (content: unknown): Promise<void> => {
    if (!terminalReady) await initializeTerminal();
    for (const character of stringValue(content)) {
      if (character === "\r" || character === "\n") {
        const command = terminalInput.trim();
        terminalInput = "";
        if (!command) {
          await handler.send("data", `\r\n${terminalPrompt()}`);
          continue;
        }
        try {
          const rows = await execute(command);
          await handler.send("data", `\r\n${terminalRows(rows)}\r\n${terminalPrompt()}`);
        } catch (error) {
          await handler.send("data", `\r\n(error) ${errorText(error)}\r\n${terminalPrompt()}`);
        }
        continue;
      }
      if (character === "\u0003") {
        terminalInput = "";
        await handler.send("data", `^C\r\n${terminalPrompt()}`);
        continue;
      }
      if (character === "\u007f") {
        if (terminalInput.length > 0) {
          terminalInput = terminalInput.slice(0, -1);
          await handler.send("data", "\b \b");
        }
        continue;
      }
      if (character >= " ") {
        terminalInput += character;
        await handler.send("data", character);
      }
    }
  };
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
      if (newKey && !key) {
        await handler.send("newKey", {
          prefix: stringValue(target.prefix),
          stack: target.stack === true,
        });
        await handler.send("detail", {
          key: "",
          value: "",
          type: "string",
          ttl: -1,
          count: 0,
          prefix: stringValue(target.prefix),
          stack: target.stack === true,
          consumerGroups: [],
        });
        return;
      }
      if (!key) throw new Error("Redis key name is empty");
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
      const consumerGroups = redisType === "stream"
        ? normalizeRedisConsumerGroups(await valueOf(`XINFO GROUPS ${JSON.stringify(key)}`))
        : [];
        await handler.send("detail", {
          key,
          value,
          type: redisType,
          ttl,
          count: collectionCount(value),
          consumerGroups,
          page: { pageNum: 1, pageSize: 100 },
        });
    } catch (error) {
      await sendError(handler, error);
    }
  };
  const update = async (content: unknown): Promise<void> => {
    try {
      const payload = record(content);
      const nestedKey = record(payload.key);
      const value = payload.value ?? nestedKey.content ?? content;
      const type = stringValue(payload.type || nestedKey.type, redisType);
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
      newKey = false;
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
  handler.on("initTerminal", initializeTerminal);
  handler.on("data", async (content) => {
    try { await processTerminalInput(content); } catch (error) { await sendError(handler, error); }
  });
  handler.on("closeTerminal", () => {
    terminalInput = "";
    terminalReady = false;
  });
  handler.onDidReset(() => {
    terminalInput = "";
    terminalReady = false;
  });
  handler.on("initStatus", loadStatus);
  handler.on("refreshStatus", loadStatus);
  handler.on("execute", async (content) => {
    try {
      const command = stringValue(record(content).command || content).trim();
      if (!command) throw new Error("Redis command cannot be empty");
      await handler.send("result", await execute(command));
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("update", update);
  handler.on("saveItem", async (content) => {
    try {
      const payload = record(content);
      const type = stringValue(payload.type, redisType);
      const keyName = stringValue(payload.keyName, key);
      if (type.toLowerCase() === "stream") {
        const streamItems = Array.isArray(payload.streamItems)
          ? payload.streamItems
          : [payload];
        for (const item of streamItems) {
          const row = record(item);
          const fields = record(row.value);
          const pairs = Object.entries(fields).filter(([field]) => field.trim());
          if (pairs.length === 0) {
            const field = stringValue(row.field || row.key).trim();
            if (!field) throw new Error("Redis stream field cannot be empty");
            pairs.push([field, stringValue(row.value)]);
          }
          const args = pairs.flatMap(([field, value]) => [JSON.stringify(field), JSON.stringify(stringValue(value))]);
          await execute(`XADD ${JSON.stringify(keyName)} * ${args.join(" ")}`);
        }
        key = keyName;
        redisType = type;
        await handler.send("success", "Redis stream item updated.");
        await load();
        return;
      }
      const commands = buildRedisItemCommands({
        keyName,
        type,
        old: record(payload.old),
        key: payload.key,
        value: payload.value,
        score: payload.score,
        index: payload.index,
        position: payload.position === "head" ? "head" : "tail",
      });
      for (const command of commands) await execute(command);
      key = keyName;
      redisType = type;
      await handler.send("success", "Redis item updated.");
      await load();
    } catch (error) { await sendError(handler, error); }
  });
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
      const payload = record(content);
      const nestedKey = record(payload.key);
      const seconds = Number(payload.ttl ?? nestedKey.ttl ?? content);
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
      const payload = record(content);
      const nestedKey = record(payload.key);
      const nextKey = stringValue(payload.name || payload.newName || nestedKey.newName || nestedKey.name || content).trim();
      if (!nextKey) throw new Error("Redis key name is empty");
      await execute(`RENAME ${JSON.stringify(key)} ${JSON.stringify(nextKey)}`);
      key = nextKey;
      await handler.send("success", `Redis key renamed to ${nextKey}.`);
      await load();
    } catch (error) { await sendError(handler, error); }
  });
  handler.on("openSettings", () => services.settings.openMoreSettings());
}

interface LokiLogRequest {
  readonly start?: number;
  readonly end?: number;
  readonly previousMinute?: number | string;
  readonly query?: string;
  readonly live?: boolean;
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function lokiLogTime(value: unknown): number | undefined {
  const timestamp = finiteNumber(value);
  if (timestamp === undefined) return undefined;
  if (timestamp > 1_000_000_000_000_000) return timestamp / 1_000_000;
  if (timestamp > 1_000_000_000_000) return timestamp;
  return timestamp * 1_000;
}

function lokiLogText(
  result: QueryResult<Record<string, unknown>>,
  live: boolean,
): { text: string; lastTime: number; hasLog: boolean } {
  const entries: Array<{ timestamp: number; value: string }> = [];
  let lastTime = Date.now();
  for (const row of rowsOf(result)) {
    const values = row.values;
    if (!Array.isArray(values)) continue;
    for (const item of values) {
      if (!Array.isArray(item) || item.length < 2) continue;
      const timestamp = lokiLogTime(item[0]);
      if (timestamp === undefined) continue;
      lastTime = Math.max(lastTime, timestamp + 1);
      entries.push({ timestamp, value: stringValue(item[1]).replace(/\n/g, "\n\r") });
    }
  }
  entries.sort((left, right) => right.timestamp - left.timestamp);
  if (entries.length === 0) {
    return { text: live ? "" : "No logs found.", lastTime, hasLog: false };
  }
  return {
    text: entries
      .map((entry) => `${new Date(entry.timestamp).toISOString()} ${entry.value}`)
      .join("\n\r"),
    lastTime,
    hasLog: true,
  };
}

function registerLokiLog(context: UtilityProtocolContext): void {
  const { handler, services, state } = context;
  registerTerminalUiProtocols(context, () => targetConnection(state)?.type || "Loki");
  const initial = { ...state, ...targetRecord(state) };
  const connection = (): ConnectionOptions | undefined =>
    targetConnection(state) || services.activeConnection.get();
  const parentLabel = stringValue(initial.parentLabel).trim();
  const labelName = stringValue(initial.labelName).trim();
  const load = async (content?: unknown): Promise<void> => {
    try {
      const selected = connection();
      if (!selected || selected.type !== "Loki") {
        throw new Error("No Loki connection selected");
      }
      if (!parentLabel || !labelName) {
        throw new Error("Loki label state is incomplete");
      }
      const request = record(content) as LokiLogRequest;
      const end = finiteNumber(request.end) ?? Date.now();
      const previousMinute = Math.max(1, finiteNumber(request.previousMinute) ?? 30);
      const start = finiteNumber(request.start) ?? end - previousMinute * 60_000;
      const query = stringValue(request.query).trim()
        || `{${parentLabel}=${JSON.stringify(labelName)}} |= \"\"`;
      const params = new URLSearchParams({
        query,
        start: `${Math.trunc(start)}000000`,
        end: `${Math.trunc(end)}000000`,
      });
      if (!request.live) {
        await handler.send("data", "Loading logs...");
      }
      const result = await services.connections.query<Record<string, unknown>>(
        selected,
        `GET /loki/api/v1/query_range?${params.toString()}`,
      );
      const output = lokiLogText(result, request.live === true);
      await handler.send("query", query);
      await handler.send("lastTime", {
        lastTime: output.lastTime,
        hasLog: output.hasLog,
      });
      if (output.text || !request.live) await handler.send("data", output.text);
    } catch (error) {
      await sendError(handler, error);
    }
  };

  handler.on("getLogs", (content) => load(content));
  handler.on("openDocument", async () => {
    await vscode.env.openExternal(vscode.Uri.parse("https://grafana.com/docs/loki/latest/logql/log_queries"));
  });
  handler.on("openSettings", () => services.settings.openMoreSettings());
  handler.onInit("lokiLog", () => load());
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
  const forwardMap = (): Record<string, ForwardEntry[]> => Object.fromEntries(
    services.state
      .keys()
      .filter((key) => key.startsWith("ssh.forwardings."))
      .map((key) => [key.slice("ssh.forwardings.".length), readList(key.slice("ssh.forwardings.".length))]),
  );
  const emit = async (): Promise<void> => {
    const connections = connectionRecords(services.state.get("ssh.connections", services.state.get("nosql.connections", services.state.get("database.connections", {}))))
      .filter((item) => item.type === "SSH" || item.type === "SFTP")
      .map((item) => ({ key: item.id, name: item.name || item.id, host: item.host }));
    await handler.send("serverKey", selectedServer);
    await handler.send("serverList", connections);
    await handler.send("forwardList", readList(selectedServer).map((item) => ({
      ...item,
      type: forwardType(item.type),
      keepAlive: item.keepAlive ?? true,
      state: services.forwarding.isActive(item.id) ? 1 : 0,
    })));
    await handler.send("name", connections.find((item) => item.key === selectedServer)?.name || selectedServer);
  };
  const save = async (content: unknown): Promise<void> => {
    const payload = record(content);
    const info = record(payload.info);
    const current = readList(stringValue(payload.serverKey, selectedServer));
    const id = info.id as string | number | null | undefined;
    const index = current.findIndex((item) => String(item.id ?? "") === String(id ?? ""));
    const next = [...current];
    const type = forwardType(info.type);
    const remoteHost = String(info.remoteHost || "").trim();
    if (type !== "Dynamic" && !remoteHost) {
      throw new Error("Remote host is required for local and remote forwarding");
    }
    const normalized: ForwardEntry = {
      ...info,
      id: id || `${Date.now()}`,
      name: stringValue(info.name),
      type,
      keepAlive: info.keepAlive !== false,
      localHost: stringValue(info.localHost, "127.0.0.1"),
      localPort: Number(info.localPort),
      remoteHost,
      remotePort: Number(info.remotePort),
    };
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
  const safeSave = async (content: unknown): Promise<void> => {
    try {
      await save(content);
    } catch (error) {
      await sendError(handler, error);
    }
  };
  handler.on("add", safeSave);
  handler.on("save", safeSave);
  handler.on("patch", safeSave);
  handler.on("remove", async (content) => {
    try {
      const id = stringValue(record(content).id, stringValue(content));
      await services.forwarding.stop(id);
      const next = readList(selectedServer).filter((item) => String(item.id ?? "") !== id);
      await services.state.update(forwardingKey(selectedServer), next);
      await emit();
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("start", async (content) => {
    const id = stringValue(record(content).id, stringValue(content));
    try {
      const info = readList(selectedServer).find((item) => String(item.id ?? "") === id);
      const server = connectionRecords(services.state.get("ssh.connections", services.state.get("nosql.connections", services.state.get("database.connections", {}))))
        .find((item) => item.id === selectedServer);
      if (!info || !server || (server.type !== "SSH" && server.type !== "SFTP")) {
        throw new Error("Forwarding server or entry was not found");
      }
      await services.forwarding.start(server as SshConnectionOptions, {
        id,
        type: forwardType(info.type),
        localHost: info.localHost,
        localPort: Number(info.localPort),
        remoteHost: String(info.remoteHost || ""),
        remotePort: Number(info.remotePort),
      });
      await handler.send("success", { action: "start", id });
      await emit();
    } catch (error) {
      await handler.send("error", { id, message: errorText(error) });
    }
  });
  handler.on("stop", async (content) => {
    const id = stringValue(record(content).id, stringValue(content));
    try {
      await services.forwarding.stop(id);
      await handler.send("success", { action: "stop", id });
      await emit();
    } catch (error) {
      await handler.send("error", { id, message: errorText(error) });
    }
  });
  handler.on("exportConfig", async () => {
    try {
      const target = await vscode.window.showSaveDialog({
        filters: { JSON: ["json"] },
        saveLabel: "Export forwarding configuration",
      });
      if (!target) return;
      await writeFile(target.fsPath, JSON.stringify(forwardMap(), null, 2), "utf8");
      await handler.send("success", "Forwarding configuration exported.");
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("importConfig", async () => {
    try {
      const targets = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { JSON: ["json"] },
        openLabel: "Import forwarding configuration",
      });
      const target = targets?.[0];
      if (!target) return;
      const parsed = JSON.parse(await readFile(target.fsPath, "utf8")) as unknown;
      const imported = record(record(parsed).forward_map || parsed);
      for (const [serverKey, value] of Object.entries(imported)) {
        if (Array.isArray(value)) {
          await services.state.update(forwardingKey(serverKey), value as ForwardEntry[]);
        }
      }
      await handler.send("importResult", {
        success: true,
        message: "Forwarding configuration imported.",
      });
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

interface SshMonitorServer {
  readonly key: string;
  readonly name: string;
  readonly host: string;
  readonly monitored?: boolean;
}

interface SshMonitorMetric extends SshMonitorServer {
  readonly online: boolean;
  readonly metricsLoading: boolean;
  readonly cpu?: number;
  readonly memory?: number;
  readonly memoryUsed?: number;
  readonly memoryTotal?: number;
  readonly disk?: number;
  readonly diskUsed?: string;
  readonly diskTotal?: string;
  readonly netRx?: number;
  readonly netTx?: number;
  readonly error?: string;
}

interface SshMonitorNetworkCache {
  readonly received: number;
  readonly sent: number;
  readonly timestamp: number;
}

function registerSshMonitor(context: UtilityProtocolContext): void {
  const { handler, services, state } = context;
  const monitorStateKey = "ssh_monitor_keys";
  const pollInterval = 5_000;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let refreshInFlight: Promise<void> | undefined;
  const networkCache = new Map<string, SshMonitorNetworkCache>();

  const connections = (): SshConnectionOptions[] => {
    const stored = connectionRecords(
      services.state.get("ssh.connections", services.state.get("nosql.connections", services.state.get("database.connections", {}))),
    )
      .filter((item) => item.type === "SSH" || item.type === "SFTP")
      .filter((item) => stringValue(item.options?.type).toLowerCase() !== "native")
      .map((item) => item as SshConnectionOptions);
    const selected = targetConnection(state);
    if (selected && (selected.type === "SSH" || selected.type === "SFTP") && !stored.some((item) => item.id === selected.id)) {
      stored.push(selected as SshConnectionOptions);
    }
    return stored;
  };

  const servers = (): SshMonitorServer[] => connections().map((connection) => ({
    key: connection.id,
    name: connection.name || connection.host || connection.id,
    host: `${connection.host || "localhost"}@${connection.port || 22}`,
  }));

  const connectionFor = (key: string): SshConnectionOptions | undefined =>
    connections().find((connection) => connection.id === key);

  const storedKeys = (): string[] => {
    const value = services.state.get<unknown>(monitorStateKey, []);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [];
  };

  const syncKeys = async (): Promise<string[]> => {
    const validKeys = new Set(servers().map((server) => server.key));
    const current = storedKeys();
    const next = current.filter((key) => validKeys.has(key));
    if (next.length !== current.length || next.some((key, index) => key !== current[index])) {
      await services.state.update(monitorStateKey, next);
    }
    return next;
  };

  const emitServerState = async (): Promise<string[]> => {
    const keys = await syncKeys();
    const monitored = new Set(keys);
    await handler.send("serverList", servers().map((server) => ({
      ...server,
      monitored: monitored.has(server.key),
    })));
    await handler.send("monitoredKeys", keys);
    return keys;
  };

  const stopPolling = (): void => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };

  const startPolling = (): void => {
    stopPolling();
    pollTimer = setInterval(() => {
      void refreshDynamicMetrics();
    }, pollInterval);
  };

  const openUtility = async (
    route: string,
    title: string,
    connection: SshConnectionOptions,
  ): Promise<void> => {
    if (context.openUtility) {
      await context.openUtility(route, title, connection);
      return;
    }
    const childState = { target: connection, connection };
    const childWebviewState = { route, connection };
    await services.webviews.createWebviewPanel({
      title: `${connection.name || connection.host || connection.id} · ${title}`,
      type: route,
      id: route,
      route,
      state: childWebviewState,
      eventHandler: (childHandler) => {
        registerWebviewUtilityProtocols({
          route,
          target: connection,
          state: childState,
          webviewState: childWebviewState,
          services,
          handler: childHandler,
        });
      },
    });
  };

  const refreshDynamicMetrics = async (): Promise<void> => {
    if (refreshInFlight) return refreshInFlight;
    const task = (async () => {
      const keys = await syncKeys();
      for (const key of keys) {
        const connection = connectionFor(key);
        if (!connection) continue;
        try {
          const snapshot = await fetchSshMonitorSnapshot(await services.ssh.open(connection));
          const previous = networkCache.get(key);
          const timestamp = Date.now();
          networkCache.set(key, {
            received: snapshot.network.received,
            sent: snapshot.network.sent,
            timestamp,
          });
          const seconds = previous ? Math.max(1, (timestamp - previous.timestamp) / 1_000) : 1;
          await handler.send("metricUpdate", {
            key,
            name: connection.name || connection.host || connection.id,
            host: `${connection.host || "localhost"}@${connection.port || 22}`,
            online: true,
            metricsLoading: false,
            cpu: snapshot.cpu,
            memory: snapshot.memory,
            memoryUsed: snapshot.memoryUsed,
            memoryTotal: snapshot.memoryTotal,
            disk: snapshot.disk,
            diskUsed: snapshot.diskUsed,
            diskTotal: snapshot.diskTotal,
            netRx: previous ? Math.max(0, snapshot.network.received - previous.received) / seconds : 0,
            netTx: previous ? Math.max(0, snapshot.network.sent - previous.sent) / seconds : 0,
          } satisfies SshMonitorMetric);
        } catch (error) {
          await handler.send("metricUpdate", {
            key,
            name: connection.name || connection.host || connection.id,
            host: `${connection.host || "localhost"}@${connection.port || 22}`,
            online: false,
            metricsLoading: false,
            error: errorText(error),
          } satisfies SshMonitorMetric);
        }
      }
    })();
    refreshInFlight = task;
    try {
      await task;
    } finally {
      if (refreshInFlight === task) refreshInFlight = undefined;
    }
  };

  const refreshMetrics = async (): Promise<void> => {
    const keys = await syncKeys();
    if (!keys.length) {
      await handler.send("metrics", []);
      return;
    }
    const monitored = new Set(keys);
    const rows: SshMonitorMetric[] = servers()
      .filter((server) => monitored.has(server.key))
      .map((server) => ({
        ...server,
        online: false,
        metricsLoading: true,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    await handler.send("metrics", rows);
    await refreshDynamicMetrics();
  };

  const saveKeys = async (content: unknown): Promise<void> => {
    const requested = Array.isArray(content)
      ? content
      : record(content).keys;
    const validKeys = new Set(servers().map((server) => server.key));
    const next = Array.isArray(requested)
      ? requested.filter((key): key is string => typeof key === "string" && validKeys.has(key))
      : [];
    await services.state.update(monitorStateKey, [...new Set(next)]);
    const keys = await emitServerState();
    if (keys.length) {
      await refreshMetrics();
      startPolling();
    } else {
      stopPolling();
      await handler.send("metrics", []);
    }
  };

  handler.on("init", async () => {
    const keys = await emitServerState();
    if (keys.length) {
      await refreshMetrics();
      startPolling();
    } else {
      await handler.send("metrics", []);
    }
  });
  handler.on("load", async () => {
    await emitServerState();
  });
  handler.on("saveMonitored", saveKeys);
  handler.on("refresh", async () => {
    networkCache.clear();
    await refreshMetrics();
  });
  handler.on("openStatus", async (content) => {
    try {
      const key = stringValue(record(content).key || content);
      const connection = connectionFor(key);
      if (!connection) throw new Error("SSH server was not found");
      await openUtility("sshStatus", "SSH Status", connection);
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("openTerminal", async (content) => {
    try {
      const key = stringValue(record(content).key || content);
      const connection = connectionFor(key);
      if (!connection) throw new Error("SSH server was not found");
      await openUtility("sshTerminal", "SSH Terminal", connection);
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.on("remove", async (content) => {
    try {
      const key = stringValue(record(content).key || content);
      const next = storedKeys().filter((item) => item !== key);
      await services.state.update(monitorStateKey, next);
      networkCache.delete(key);
      const keys = await emitServerState();
      if (keys.length) {
        await refreshMetrics();
        startPolling();
      } else {
        stopPolling();
        await handler.send("metrics", []);
      }
      await handler.send("removed", { message: "Removed from monitor" });
    } catch (error) {
      await sendError(handler, error);
    }
  });
  handler.onDidReset(stopPolling);
  handler.onDidDispose(stopPolling);
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
    const stored = connectionRecords(services.state.get("database.connections", {}));
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

function registerErDiagram(context: UtilityProtocolContext): void {
  const { handler, services } = context;
  const target = targetRecord(context.state);
  const connection = (): ConnectionOptions | undefined =>
    targetConnection(context.state) || services.activeConnection.get();
  const table = (): string | undefined => firstText(
    context.state.table,
    context.state.tableName,
    target.table,
    target.tableName,
    target.label,
  );
  const schema = (): string | null => firstText(
    context.state.schema,
    target.schema,
    connection()?.schema,
  ) || null;
  const database = (): string | null => firstText(
    context.state.database,
    target.database,
    connection()?.database,
  ) || null;

  const load = async (): Promise<void> => {
    try {
      const selected = connection();
      const selectedTable = table();
      if (!selected) {
        throw new Error("No database connection selected for the ER diagram");
      }
      if (!selectedTable) {
        throw new Error("Select a single table before opening the ER diagram");
      }
      const dialect = services.dialects.resolve(selected.type);
      const executor: MetadataQueryExecutor = {
        query<Row = Record<string, unknown>>(sql: string, options?: QueryOptions) {
          return services.connections.query<Row>(selected, sql, options);
        },
      };
      const data: ErDiagramData = await loadErDiagram(executor, dialect, {
        table: selectedTable,
        schema: schema(),
        database: database(),
      });
      await handler.setWebviewState({
        ...context.webviewState,
        connection: selected,
        table: selectedTable,
        schema: schema(),
        database: database(),
        erData: data,
      });
      await handler.send("erData", data);
    } catch (error) {
      await sendError(handler, error);
    }
  };

  handler.onInit("erDiagram", load);
  handler.on("erData", load);
  handler.on("single_table", load);
  handler.on("refreshCache", load);
  handler.on("refresh", load);
  handler.on("exportImg", async (content) => {
    try {
      const payload = record(content);
      const requestedType = stringValue(payload.type, "svg").toLowerCase();
      const type = requestedType === "json" ? "json" : "svg";
      const raw = payload.data;
      const data = typeof raw === "string" ? raw : JSON.stringify(raw ?? {});
      const file = await vscode.window.showSaveDialog({
        saveLabel: "Export ER diagram",
        filters: { [type.toUpperCase()]: [type] },
      });
      if (!file) {
        return;
      }
      await writeFile(file.fsPath, data, "utf8");
      await handler.send("exportSuccess", { path: file.fsPath, type });
    } catch (error) {
      await sendError(handler, error);
    }
  });
}

export async function openErDiagramPanel(
  services: ExtensionServices,
  target: unknown,
  title = "ER Diagram",
): Promise<vscode.WebviewPanel> {
  const candidate = record(target);
  const connection = targetConnection(target);
  const table = firstText(candidate.table, candidate.tableName, candidate.label);
  const schema = firstText(candidate.schema, connection?.schema);
  const database = firstText(candidate.database, connection?.database);
  const normalizedTarget = { connection, table, schema, database };
  const state = {
    target: normalizedTarget,
    connection,
    table,
    schema,
    database,
  };
  return services.webviews.createWebviewPanel({
    title,
    type: "erDiagram",
    route: "erDiagram",
    state,
    eventHandler: (handler) => {
      registerWebviewUtilityProtocols({
        route: "erDiagram",
        target: normalizedTarget,
        state,
        webviewState: state,
        services,
        handler,
      });
    },
  });
}

export function registerWebviewUtilityProtocols(context: UtilityProtocolContext): void {
  if (context.route === "document") registerDocument(context);
  if (context.route === "plan" || context.route === "console") registerCloudPage(context);
  if (context.route === "image") registerImage(context);
  if (context.route === "manager") registerManager(context);
  if (context.route === "util") registerUtility(context);
  if (context.route === "fileManager" || context.route === "sshTerminal") {
    registerRemoteFileManager(context);
  }
  if (context.route === "sshTerminal") {
    registerSshTerminal(context);
    registerSshMonitor(context);
    registerForwarding(context);
  }
  if (context.route === "mock") registerMock(context);
  if (context.route === "rabbitQueueView") registerRabbitQueue(context);
  if (context.route === "keyView") registerRedisKey(context);
  if (context.route === "lokiLog") registerLokiLog(context);
  if (context.route === "esStatus") registerElasticsearchStatus(context);
  if (context.route === "forward") registerForwarding(context);
  if (context.route === "sshStatus") registerSshStatus(context);
  if (context.route === "sshMonitor") registerSshMonitor(context);
  if (context.route === "xterm") {
    registerXterm(context);
    registerSshTerminal(context);
  }
  if (context.route === "structDiff" || context.route === "manager") {
    registerStructureDiff(context);
  }
  if (context.route === "erDiagram") registerErDiagram(context);
}
