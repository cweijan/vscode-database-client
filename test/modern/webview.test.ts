import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import AdmZip from "adm-zip";

import { NoopLogger } from "../../src/modern/core/logging";
import { CacheService } from "../../src/modern/core/cache";
import { CloudService, decodeLicense } from "../../src/modern/core/cloudService";
import {
  CloudConfigSyncService,
  decryptSyncConfig,
  encryptSyncConfig,
  parseCloudConfig,
} from "../../src/modern/core/cloudConfigSyncService";
import {
  connectionConfigKey,
  ConnectionConfigStore,
} from "../../src/modern/core/connectionConfigStore";
import { decodeImageDataUrl, TinyPngService } from "../../src/modern/core/imageService";
import {
  computeUtilityValue,
  createRandomUtilityValue,
  parseCsvRow,
  parsePosixProcesses,
  prettyBytes,
} from "../../src/modern/core/utilityService";
import { TypedWebviewHandler } from "../../src/modern/core/webviewHandler";
import { renderWebviewHtml } from "../../src/modern/core/webviewHtml";
import { MemoryStateStore } from "../../src/modern/core/state";
import { WebviewBridge } from "../../src/modern-webview/bridge";
import { readWebviewBootstrap } from "../../src/modern-webview/bootstrap";
import {
  DEFAULT_TERMINAL_SETTINGS,
  readTerminalSettings,
} from "../../src/modern-webview/terminalConfig";
import {
  routeFromPath,
  routeLocation,
  routePath,
  WEBVIEW_ROUTES,
} from "../../src/modern-webview/routeRegistry";
import { buildDocumentationUrl } from "../../src/modern-webview/document";
import { WebviewStateStore } from "../../src/modern-webview/state";
import { sanitizeWebviewState } from "../../src/modern/providers/webviewState";
import { asConnectionOptions, connectionOption } from "../../src/modern/database/connectionOptions";

class FakeMessageTarget {
  public listener: ((event: MessageEvent) => void) | undefined;
  public removed = false;

  public addEventListener(
    _type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    this.listener = listener as (event: MessageEvent) => void;
  }

  public removeEventListener(
    _type: string,
    _listener: EventListenerOrEventListenerObject,
  ): void {
    this.removed = true;
    this.listener = undefined;
  }

  public dispatch(data: unknown): void {
    this.listener?.({ data } as MessageEvent);
  }
}

class FakeMemento {
  private readonly values = new Map<string, unknown>();

  public get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  public update(key: string, value: unknown): Thenable<void> {
    if (value === undefined) this.values.delete(key);
    else this.values.set(key, value);
    return Promise.resolve();
  }

  public keys(): readonly string[] {
    return [...this.values.keys()];
  }
}

test("Webview bridge provides init, typed dispatch, and disposal", () => {
  const target = new FakeMessageTarget();
  const sent: unknown[] = [];
  const bridge = new WebviewBridge(
    {
      getState: () => ({ persisted: true }),
      postMessage: (message) => sent.push(message),
      setState: (state) => state,
    },
    target,
  );
  const messages: string[] = [];
  bridge.on("setState", (_content, message) => messages.push(message.type));
  bridge.onAny((_content, message) => messages.push("any:" + message.type));

  bridge.init("query");
  target.dispatch({ type: "setState", content: { value: 1 } });
  bridge.dispose();

  assert.deepEqual(sent, [
    { type: "init", content: { type: "query" } },
  ]);
  assert.deepEqual(messages, ["setState", "any:setState"]);
  assert.equal(target.removed, true);
});

test("host Webview handler routes messages and releases listeners", async () => {
  let receive: ((message: { type: string; content?: unknown }) => void) | undefined;
  let disposed: (() => void) | undefined;
  const sent: unknown[] = [];
  const webview = {
    postMessage: async (message: unknown) => {
      sent.push(message);
      return true;
    },
    onDidReceiveMessage: (listener: typeof receive) => {
      receive = listener;
      return { dispose: () => { receive = undefined; } };
    },
    onDidDispose: (listener: () => void) => {
      disposed = listener;
      return { dispose: () => { disposed = undefined; } };
    },
  };
  const handler = new TypedWebviewHandler(webview, new NoopLogger());
  const received: unknown[] = [];
  handler.onInit("query", (content) => {
    received.push(content);
  });

  receive?.({ type: "init", content: { type: "query" } });
  await handler.setWebviewState({ rows: [] });
  disposed?.();
  await handler.send("stale");

  assert.deepEqual(received, [{ type: "query" }]);
  assert.deepEqual(sent, [{ type: "setState", content: { rows: [] } }]);
});

test("host Webview handler exposes reset and dispose lifecycle hooks", () => {
  let disposed: (() => void) | undefined;
  const webview = {
    postMessage: async () => true,
    onDidReceiveMessage: () => ({ dispose: () => {} }),
    onDidDispose: (listener: () => void) => {
      disposed = listener;
      return { dispose: () => { disposed = undefined; } };
    },
  };
  const handler = new TypedWebviewHandler(webview, new NoopLogger());
  let resets = 0;
  let disposals = 0;
  handler.onDidReset(() => { resets += 1; });
  handler.onDidDispose(() => { disposals += 1; });

  handler.reset();
  disposed?.();

  assert.equal(resets, 1);
  assert.equal(disposals, 1);
});

test("Webview HTML renderer closes local asset and CSP references", () => {
  const html = renderWebviewHtml(
    '<html><head></head><body><script type="module" src="./assets/app.js"></script><div data-config="{{configs}}"></div></body></html>',
    {
      cspSource: "vscode-webview://test",
      nonce: "nonce-value",
      config: { language: "en", quote: "'" },
      resolveAsset: (asset) => "vscode-webview://test/" + asset,
    },
  );
  assert.match(html, /nonce="nonce-value"/);
  assert.match(html, /vscode-webview:\/\/test\/assets\/app\.js/);
  assert.match(html, /font-src vscode-webview:\/\/test data:/);
  assert.match(html, /connect-src vscode-webview:\/\/test/);
  assert.match(html, /script-src 'nonce-nonce-value' vscode-webview:\/\/test/);
  assert.match(html, /&amp;quot|&quot;/);
  assert.doesNotMatch(html, /\{\{configs\}\}/);
});

test("Webview state store persists locally and reports host state changes", () => {
  const target = new FakeMessageTarget();
  const sent: unknown[] = [];
  const bridge = new WebviewBridge(
    {
      getState: () => ({ page: "query" }),
      postMessage: (message) => sent.push(message),
      setState: (state) => state,
    },
    target,
  );
  const state = new WebviewStateStore(bridge);
  state.update("connectionKey", "oracle-1");

  assert.equal(state.get("page", "home"), "query");
  assert.equal(state.get("connectionKey", ""), "oracle-1");
  assert.deepEqual(sent, [
    {
      type: "upState",
      content: { key: "connectionKey", value: "oracle-1" },
    },
  ]);
});

test("Webview route registry preserves target names and nested paths", () => {
  assert.deepEqual(
    WEBVIEW_ROUTES.map((route) => route.name),
    [
      "connect",
      "dbFileConnect",
      "parquet",
      "sqlite",
      "result",
      "manager",
      "esStatus",
      "design",
      "erDiagram",
      "mock",
      "structDiff",
      "keyView",
      "lokiLog",
      "rabbitQueueView",
      "forward",
      "xterm",
      "sshTerminal",
      "fileManager",
      "sshStatus",
      "sshMonitor",
      "document",
      "plan",
      "console",
      "util",
      "image",
    ],
  );
  assert.deepEqual(routeLocation("/connect"), { name: "connect" });
  assert.equal(routePath("sqlite"), "/sqlite");
  assert.equal(routeFromPath("/keyView")?.name, "keyView");
  assert.equal(routeFromPath("/lokiLog")?.name, "lokiLog");
  assert.equal(routeFromPath("/rabbitQueueView")?.name, "rabbitQueueView");
  assert.equal(routeFromPath("/forward")?.name, "forward");
  assert.equal(routeFromPath("/structDiff")?.name, "structDiff");
  assert.equal(routeFromPath("/sshMonitor")?.name, "sshMonitor");
  assert.equal(routeFromPath("/fileManager")?.name, "fileManager");
  assert.equal(routeFromPath("/es-status")?.name, "esStatus");
  assert.equal(routePath("document"), "/center/document");
  assert.equal(routeFromPath("/center/document")?.name, "document");
});

test("Structure Diff preserves the target page regions and typed action protocol", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/modern-webview/components/StructureDiffView.vue"),
    "utf8",
  );
  for (const marker of [
    "struct-diff-page",
    "service-type-option",
    "config-panel",
    "migration-panel",
    "migration-tree--target",
    "migration-detail",
    "bridge?.emit(\"start\"",
    "bridge?.emit(\"sync\"",
  ]) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /\bas\s+any\b/);
});

test("SQL design page preserves the target info panel, tab order, and init protocol", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/modern-webview/components/DesignView.vue"),
    "utf8",
  );
  for (const marker of [
    "design-info-panel",
    "design-info-row",
    "design-info-field",
    "design-info-label",
    "design-info-input",
    "design-info-select",
    "type-hr",
    'data-region="design-tabs"',
    "designPanelLabels",
    'foreignKey: "Foreign keys"',
    'bridge?.init("design")',
    'bridge?.on("designMetaNext"',
    'data-region="ddl-panel"',
    'data-region="column-panel"',
    'data-region="foreign-key-panel"',
    'data-region="index-panel"',
    'data-region="trigger-panel"',
    'data-region="check-panel"',
    "supportForeignKey",
    "supportIndex",
    "supportTrigger",
    "canAlterTable",
    "dropColumn",
    "Copy DDL",
  ]) {
    assert.ok(source.includes(marker), `missing DesignView marker: ${marker}`);
  }
  assert.match(source, /design\.supportForeignKey = source\.supportForeignKey/);
  assert.match(source, /design\.supportIndex = source\.supportIndex/);
  assert.match(source, /design\.supportTrigger = source\.supportTrigger/);
  assert.match(source, /design\.canAlterTable = source\.canAlterTable/);
  assert.match(source, /dbType: design\.dbType/);
  assert.doesNotMatch(source, /activePanel === ['"]info['"]/);
  assert.doesNotMatch(source, /\bas\s+any\b/);
});

test("SQL result page preserves target execution states and mutation actions", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/modern-webview/components/ResultView.vue"),
    "utf8",
  );
  for (const marker of [
    'data-route="result"',
    'bridge?.on("RUN"',
    'bridge?.on("DATA"',
    'bridge?.on("NEXT_PAGE"',
    'bridge?.on("COUNT"',
    'bridge?.on("DML"',
    'bridge?.on("DDL"',
    'bridge?.on("ERROR"',
    'bridge?.on("MESSAGE_BLOCK"',
    'bridge?.on("MESSAGE"',
    "bridge?.emit('openConsole')",
    "bridge?.emit(\"stopExecute\")",
    "bridge?.emit('viewHistory')",
    "bridge?.emit('viewJSON')",
    "setAutoRefresh",
    "{ value: '300', label: '5m' }",
    'bridge?.emit("saveModify"',
    'bridge?.emit("filterResult"',
    'bridge?.emit("exportFile"',
  ]) {
    assert.ok(source.includes(marker), `missing ResultView marker: ${marker}`);
  }
  assert.doesNotMatch(source, /\bas\s+any\b/);
  const protocols = await readFile(
    path.join(process.cwd(), "src/modern/commands/resultProtocols.ts"),
    "utf8",
  );
  for (const marker of [
    'handler.on("openConsole"',
    'handler.on("stopExecute"',
    "AbortController",
    'context.openConsole',
  ]) {
    assert.ok(protocols.includes(marker), `missing Result protocol marker: ${marker}`);
  }
});

test("Redis key page preserves target tabs, key protocols, and new-key boundaries", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/modern-webview/components/RedisView.vue"),
    "utf8",
  );
  const host = await readFile(
    path.join(process.cwd(), "src/modern/commands/webviewUtilityProtocols.ts"),
    "utf8",
  );
  for (const marker of [
    'data-route="keyView"',
    'bridge?.init("keyView")',
    'bridge?.on("detail"',
    'bridge?.on("newKey"',
    'bridge?.on("pagination"',
    'bridge?.on("status"',
    'refreshStatus',
    'initTerminal',
    'createKey',
    'saveItem',
    'deleteLine',
    'deleteConsumerGroup',
    'changePage',
    'contentMode',
    'emit("ttl", { key:',
    'emit("rename", { key:',
    'emit("del", { key:',
    'redis-new-key-dialog',
    'redis-key-status',
    'redis-terminal-actions',
  ]) {
    assert.ok(source.includes(marker), `missing RedisView marker: ${marker}`);
  }
  assert.match(source, /const loading = ref\(true\)/);
  assert.match(source, /const newKeyTypes = computed/);
  assert.doesNotMatch(source, /\bas\s+any\b/);
  for (const marker of [
    'handler.send("newKey"',
    'stack: target.stack === true',
    'newKey = false',
  ]) {
    assert.ok(host.includes(marker), `missing Redis host marker: ${marker}`);
  }
});

test("Manager, dump, and settings pages preserve target shared protocols", async () => {
  const manager = await readFile(
    path.join(process.cwd(), "src/modern-webview/components/ManagerView.vue"),
    "utf8",
  );
  const dump = await readFile(
    path.join(process.cwd(), "src/modern-webview/components/DumpView.vue"),
    "utf8",
  );
  const settings = await readFile(
    path.join(process.cwd(), "src/modern-webview/components/SettingsView.vue"),
    "utf8",
  );
  const host = await readFile(
    path.join(process.cwd(), "src/modern/commands/webviewUtilityProtocols.ts"),
    "utf8",
  );
  for (const [source, markers] of [
    [manager, [
      'data-route="manager"',
      "processList",
      "dashBoard",
      "open_dump",
      'bridge?.init("manager")',
      "focusHandler",
      "StructureDiffView",
    ]],
    [dump, [
      "dumpInit",
      "dumpChoose",
      "installDependency",
      "dumpRun",
      "manager-dump__checks",
    ]],
    [settings, [
      'data-route="console"',
      "Current workspace",
      "exportWithAdditionalFiles",
      "openMoreSettings",
      "resetGroup",
      "closeAllConnections",
    ]],
  ] as const) {
    for (const marker of markers) {
      assert.ok(source.includes(marker), `missing shared page marker: ${marker}`);
    }
    assert.doesNotMatch(source, /\bas\s+any\b/);
  }
  for (const marker of [
    'handler.on("dumpInit"',
    'handler.on("dumpRun"',
    'handler.on("updateOption"',
    'handler.on("resetOption"',
    'handler.on("exportConfig"',
    'handler.on("importConfig"',
    "openConnectionConfig",
  ]) {
    assert.ok(host.includes(marker), `missing shared host protocol: ${marker}`);
  }
});

test("Webview manager exposes packaged extension resources to dynamic page icons", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/modern/core/vscodeWebviewManager.ts"),
    "utf8",
  );
  assert.match(source, /extensionResourceRoot/);
  assert.match(source, /assetBase/);
  assert.match(source, /localResourceRoots/);
});

test("core connection page preserves target shell and separate save/connect actions", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/modern-webview/components/ConnectionView.vue"),
    "utf8",
  );
  source;
  for (const marker of [
    "root-container flex mx-auto",
    "connect-container max-lg:px-5",
    "connection-panel",
    "connect-config-container",
    "coreServerRows",
    "mysql_dark.svg",
    "mariadb.svg",
    "postgresql.svg",
    "sqlite.svg",
    "sqlserver.svg",
    "db2.svg",
    "oracle.png",
    "kingbase.svg",
    "clickhouse.svg",
    "java.png",
    "docker.svg",
    "redis.png",
    "elasticsearch.svg",
    "mongodb.svg",
    "s3.png",
    "ftp.png",
    "kafka.png",
    "rabbitmq.svg",
    "cassandra.svg",
    "gnu.svg",
    "rdp.png",
    "more.png",
    "ServiceSelector",
    "ConnectionDialog",
    "advanceVisible",
    "redisAdvanceVisible",
    "sshAdvanceVisible",
    "hideSystemSchema",
    "databaseNumber",
    "totalKeyCount",
    "serverType",
    "ftpRoot",
    "pruneSFTPRoot",
    "showHiddenFiles",
    "agentPath",
    "sslVisible",
    "connect-bar",
    "bridge?.emit(\"saveConnection\"",
    "bridge?.emit(\"connect\"",
    "coreConnectionDefaults",
    "sshConnect",
    "native",
  ]) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /bridge\?\.emit\("save",/);
  assert.doesNotMatch(source, /\bas\s+any\b/);

  const selector = await readFile(
    path.join(process.cwd(), "src/modern-webview/components/ServiceSelector.vue"),
    "utf8",
  );
  for (const marker of ["server-item", "tab__item", "more-server-container", "divider"]) {
    assert.ok(selector.includes(marker), marker);
  }
});

test("core connection page applies the DESIGN.md visual tokens", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/modern-webview/style.css"),
    "utf8",
  );
  for (const marker of [
    "--design-brand-green: #00ed64",
    "--design-brand-teal-deep: #001e2b",
    "Euclid Circular A",
    "border-radius: 9999px",
    "connection-view__heading",
    "connection-dialog__header",
  ]) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Linux SSH terminal preserves target tabs, xterm, SFTP split, and terminal actions", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/modern-webview/components/SshTerminalView.vue"),
    "utf8",
  );
  for (const marker of [
    "ssh-terminal",
    "sshTerminalTab",
    "ssh-terminal-tabs",
    "Monitor",
    "Port Forwarding",
    "ssh-terminal-actions",
    "ssh-terminal-split",
    "XtermView",
    "RemoteFileManagerView",
    "SshMonitorView",
    "ForwardView",
    "initSftpConfig",
    "initSftp",
    "switchTab",
    "ssh-editor-modal",
    "duplicateTab",
    "initTerminal",
  ]) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /ssh-terminal-view__output/);
  assert.doesNotMatch(source, /\bas\s+any\b/);
  const host = await readFile(
    path.join(process.cwd(), "src/modern/commands/webviewUtilityProtocols.ts"),
    "utf8",
  );
  assert.match(host, /context\.route === "sshTerminal"\) \{[\s\S]*registerSshMonitor\(context\)/);
  assert.match(host, /context\.route === "sshTerminal"\) \{[\s\S]*registerForwarding\(context\)/);
});

test("terminal settings preserve target defaults and clamp invalid values", () => {
  assert.deepEqual(readTerminalSettings({
    scrollback: -1,
    fontSize: 64,
    lineHeight: 0,
    cursorStyle: "invalid",
    cursorBlinking: "yes",
    terminalTheme: "invalid",
  }), DEFAULT_TERMINAL_SETTINGS);
  assert.deepEqual(readTerminalSettings({
    scrollback: 2000,
    fontSize: 16,
    lineHeight: 1.2,
    cursorStyle: "underline",
    cursorBlinking: false,
    terminalTheme: "Dracula",
  }), {
    scrollback: 2000,
    fontSize: 16,
    lineHeight: 1.2,
    cursorStyle: "underline",
    cursorBlinking: false,
    terminalTheme: "Dracula",
  });
});

test("documentation route preserves target language and theme URL semantics", () => {
  assert.equal(
    buildDocumentationUrl("https://database-client.com/", "en", "dark"),
    "https://database-client.com/docs/?theme=dark",
  );
  assert.equal(
    buildDocumentationUrl("http://127.0.0.1:8828/", "zh-CN", "light"),
    "http://127.0.0.1:8828/docs/#/zh/?theme=light",
  );
  assert.equal(buildDocumentationUrl("", "en", "dark"), "");
});

test("Webview bootstrap reads host config and tolerates a development placeholder", () => {
  const config = {
    language: "zh-CN",
    route: "design",
    state: { page: "design", connectionKey: "oracle-1" },
    config: { defaultSelectLimit: 1000 },
  };
  const documentLike = {
    getElementById: (id: string) =>
      id === "dbclient-configs"
        ? ({ getAttribute: () => JSON.stringify(config) } as unknown as HTMLElement)
        : null,
  } as Pick<Document, "getElementById">;

  assert.deepEqual(readWebviewBootstrap(documentLike), {
    appName: undefined,
    language: "zh-CN",
    route: "design",
    state: config.state,
    config: config.config,
  });
  assert.deepEqual(
    readWebviewBootstrap({ getElementById: () => null }),
    {
      appName: undefined,
      language: "en",
      route: undefined,
      state: {},
      config: {},
    },
  );
});

test("Webview serializer state removes passwords from nested connection targets", () => {
  const state = sanitizeWebviewState({
    connection: { id: "db-1", type: "MySQL", password: "secret" },
    target: {
      connection: { id: "db-1", type: "MySQL", password: "secret" },
      options: { id: "db-1", type: "MySQL", password: "secret" },
    },
  });
  const target = state.target as Record<string, unknown>;
  assert.equal((state.connection as Record<string, unknown>).password, undefined);
  assert.equal((target.connection as Record<string, unknown>).password, undefined);
  assert.equal((target.options as Record<string, unknown>).password, undefined);
});

test("cloud service keeps account state and decodes raw license payloads", async () => {
  const storage = new FakeMemento();
  const service = new CloudService(storage, "machine-1", new NoopLogger());
  await service.setUser({ email: "user@example.com", expireTime: Date.now() + 60_000 }, true);

  assert.equal(service.getEmail(), "user@example.com");
  assert.equal(service.getMachineId(), "machine-1");
  assert.equal(service.isPay(), true);
  assert.deepEqual(decodeLicense('{"email":"user@example.com"}'), {
    email: "user@example.com",
  });
});

test("cloud config sync preserves target encryption and archive boundaries", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "database-client-sync-"));
  const keyPath = path.join(root, "sync.key");
  const queryPath = path.join(root, "query", "orders.sql");
  await writeFile(keyPath, "sync-secret", "utf8");
  await mkdir(path.dirname(queryPath), { recursive: true });
  await writeFile(queryPath, "SELECT * FROM orders;", "utf8");

  const encrypted = encryptSyncConfig('{"ok":true}', "sync-secret");
  assert.deepEqual(parseCloudConfig(encrypted, "sync-secret"), { ok: true });
  assert.throws(() => decryptSyncConfig(encrypted), /choose the sync key/);

  const state = new MemoryStateStore();
  await state.update("mysql.connections", { db1: { id: "db1", type: "MySQL" } });
  let uploaded: Buffer | undefined;
  const cloud = {
    uploadSyncArchive: async (archive: Uint8Array) => { uploaded = Buffer.from(archive); },
    downloadSyncArchive: async () => uploaded || Buffer.alloc(0),
    removeSyncArchive: async () => {},
  } as unknown as CloudService;
  const connections = new ConnectionConfigStore(state);
  const service = new CloudConfigSyncService(cloud, connections, root, new NoopLogger());

  const size = await service.upload(keyPath);
  assert.equal(size, uploaded?.byteLength);
  const archive = new AdmZip(uploaded);
  assert.ok(archive.getEntry("database-client-config.json"));
  assert.ok(archive.getEntry("query/orders.sql"));
  const snapshot = parseCloudConfig(
    archive.readAsText(archive.getEntry("database-client-config.json")!),
    "sync-secret",
  );
  assert.deepEqual(snapshot.database, { db1: { id: "db1", type: "MySQL" } });
  assert.equal(snapshot.settings, undefined);
  assert.equal(snapshot.state, undefined);

  await service.download({ keyPath, type: "" });
  const importedState = new MemoryStateStore();
  const importedConnections = new ConnectionConfigStore(importedState);
  const importedService = new CloudConfigSyncService(
    cloud,
    importedConnections,
    root,
    new NoopLogger(),
  );
  await importedService.importArchive(uploaded!, { keyPath });
  assert.deepEqual(importedState.get("mysql.connections", {}), {
    db1: { id: "db1", type: "MySQL" },
  });
  await rm(root, { recursive: true, force: true });
});

test("connection config store preserves target scopes and legacy state aliases", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "database-client-config-"));
  const workspaceRoot = path.join(root, "workspace");
  const globalState = new MemoryStateStore({
    "mysql.connections": {
      legacy: {
        id: "legacy",
        type: "MySQL",
        password: "secret",
        provider: { stale: true },
        parent: { stale: true },
      },
    },
  });
  const store = new ConnectionConfigStore(globalState, undefined, workspaceRoot);

  assert.deepEqual(store.config(), {
    database: {
      legacy: { id: "legacy", type: "MySQL", password: "secret" },
    },
    nosql: {},
    $schema: "https://database-client.com/schema/config.json",
  });
  await store.updateScope(false, {
    current: { id: "current", type: "PostgreSQL" },
  }, undefined, false);
  assert.deepEqual(globalState.get("database.connections", {}), {
    current: { id: "current", type: "PostgreSQL" },
  });
  assert.deepEqual(store.get("mysql.connections", {}), {
    current: { id: "current", type: "PostgreSQL" },
  });

  const workspaceConfigPath = path.join(workspaceRoot, ".vscode", "database-client-config.json");
  await mkdir(path.dirname(workspaceConfigPath), { recursive: true });
  await writeFile(workspaceConfigPath, JSON.stringify({
    database: { workspaceDb: { id: "workspaceDb", type: "MySQL" } },
    nosql: {},
  }), "utf8");
  assert.deepEqual(store.config(true).database, {
    workspaceDb: { id: "workspaceDb", type: "MySQL" },
  });
  assert.deepEqual(store.config().database, {
    current: { id: "current", type: "PostgreSQL" },
  });
  const visible = store.get<Record<string, Record<string, unknown>>>(
    "database.connections",
    {},
  );
  assert.equal(visible.current.global, true);
  assert.equal(visible.workspaceDb.global, false);
  assert.deepEqual(Object.keys(visible), ["current", "workspaceDb"]);
  delete visible.current;
  await store.update("database.connections", visible);
  assert.deepEqual(globalState.get("database.connections", {}), {});
  assert.deepEqual(
    (JSON.parse(await readFile(workspaceConfigPath, "utf8")) as Record<string, unknown>).database,
    { workspaceDb: { id: "workspaceDb", type: "MySQL" } },
  );
  await store.updateScope(true, {
    added: { id: "added", type: "MySQL" },
  }, undefined, true);
  const savedWorkspace = JSON.parse(await readFile(workspaceConfigPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(savedWorkspace.database, {
    workspaceDb: { id: "workspaceDb", type: "MySQL" },
    added: { id: "added", type: "MySQL" },
  });
  await rm(root, { recursive: true, force: true });
});

test("target connection fields normalize without mutating the stored shape", () => {
  const source = {
    id: "target-mysql",
    dbType: "MySQL",
    host: "db.example.com",
    usingSSH: true,
    advance: { timeZone: "+08:00" },
  };
  const normalized = asConnectionOptions(source);

  assert.equal(normalized?.type, "MySQL");
  assert.equal(connectionOption(normalized!, "usingSSH"), true);
  assert.equal(connectionOption(normalized!, "timezone"), "+08:00");
  assert.equal((source as { type?: string }).type, undefined);
});

test("connection scope selection follows the target database and NoSQL split", () => {
  assert.equal(connectionConfigKey("MySQL"), "database.connections");
  assert.equal(connectionConfigKey("PostgreSQL"), "database.connections");
  assert.equal(connectionConfigKey("MongoDB"), "nosql.connections");
  assert.equal(connectionConfigKey("SSH"), "nosql.connections");
  assert.equal(connectionConfigKey("WebDAV"), "nosql.connections");
});

test("cache clearing removes stale target files without losing active history", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "database-client-cache-"));
  const activeStorage = path.join(root, "storage", "db1@MySQL");
  const staleStorage = path.join(root, "storage", "old@MySQL");
  const activeQuery = path.join(root, "query", "db1__default__default");
  const staleQuery = path.join(root, "query", "old__default__default");
  await mkdir(activeStorage, { recursive: true });
  await mkdir(staleStorage, { recursive: true });
  await mkdir(activeQuery, { recursive: true });
  await mkdir(staleQuery, { recursive: true });
  await writeFile(path.join(root, "storage", "history.sql"), "history", "utf8");
  await writeFile(path.join(root, "storage", "other.bin"), "remove", "utf8");
  await writeFile(path.join(activeStorage, "db1-mock.json"), "{}", "utf8");
  await writeFile(path.join(staleStorage, "stale.txt"), "remove", "utf8");
  await writeFile(path.join(activeQuery, "orders.sql"), "SELECT 1", "utf8");
  await writeFile(path.join(staleQuery, "stale.sql"), "SELECT 1", "utf8");

  let clearers = 0;
  const cache = new CacheService(root, () => new Set(["db1"]));
  cache.register(() => { clearers += 1; });
  await cache.clear();

  assert.equal(clearers, 1);
  assert.equal(await readFile(path.join(root, "storage", "history.sql"), "utf8"), "history");
  assert.equal(await readFile(path.join(activeQuery, "orders.sql"), "utf8"), "SELECT 1");
  await assert.rejects(readFile(path.join(root, "storage", "other.bin")));
  await assert.rejects(readFile(path.join(activeStorage, "db1-mock.json")));
  await assert.rejects(readFile(path.join(staleStorage, "stale.txt")));
  await assert.rejects(readFile(path.join(staleQuery, "stale.sql")));
  await rm(root, { recursive: true, force: true });
});

test("image service validates data URLs and stores TinyPNG key state", async () => {
  let apiKey = "";
  const tinyPng = new TinyPngService(
    () => apiKey,
    async (value) => { apiKey = value; },
  );
  assert.deepEqual(tinyPng.getStatus(), { configured: false, apiKey: "" });
  assert.deepEqual(await tinyPng.setApiKey(" key-value "), {
    configured: true,
    apiKey: "key-value",
  });
  assert.deepEqual(decodeImageDataUrl("not-an-image"), undefined);
  const decoded = decodeImageDataUrl("data:image/png;base64,AAEC");
  assert.equal(decoded?.mimeType, "image/png");
  assert.equal(decoded?.extension, "png");
  assert.deepEqual([...decoded?.bytes || []], [0, 1, 2]);
});

test("utility service preserves target hash, encoding, and byte formatting behavior", () => {
  const value = computeUtilityValue("hello world");
  assert.equal(value.md5, "5eb63bbbe01eeed093cb22bb8f5acdc3");
  assert.equal(value.sha1, "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed");
  assert.equal(value.base64Encode, "aGVsbG8gd29ybGQ=");
  assert.equal(value.urlEncode, "hello%20world");
  assert.equal(value.urlDecode, "hello world");
  assert.equal(computeUtilityValue("aGVsbG8=").base64Decode, "hello");
  assert.equal(prettyBytes(1024), "1K");
  assert.equal(prettyBytes(1536), "1.5K");
  assert.equal(prettyBytes(0), "0 B");
});

test("utility service parses Windows and POSIX process rows without untyped data", () => {
  assert.deepEqual(
    parseCsvRow('"node.exe","1234","Console","1","12,345 K"'),
    ["node.exe", "1234", "Console", "1", "12,345 K"],
  );
  assert.deepEqual(
    parsePosixProcesses("123 1 dev 0.5 1024 01:02:03 /usr/bin/node --inspect"),
    [{
      pid: 123,
      ppid: 1,
      name: "node",
      user: "dev",
      cpu: "0.5%",
      memory: "1.0 MB",
      runtime: "01:02:03",
      command: "/usr/bin/node --inspect",
    }],
  );
});

test("utility service generates the target random value shape", () => {
  const value = createRandomUtilityValue();
  assert.match(value.uuid, /^[0-9a-f-]{36}$/);
  assert.match(value.username, /^user_[a-z0-9]{10}$/);
  assert.equal(value.password.length, 12);
});
