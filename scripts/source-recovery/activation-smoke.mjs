#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const extensionBundle = path.join(
  projectRoot,
  "dist-modern",
  "extension",
  "extension.js",
);
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const expectedCommands = packageJson.contributes.commands.map(
  (contribution) => contribution.command,
);
const expectedInternalCommands = [
  "mysql.query.open",
  "mysql.history.view",
  "mysql.history.refresh",
  "mysql.codeLens.run",
  "mysql.codeLens.copy",
  "mysql.ai.copilot",
  "mysql.ai.cursor",
  "mysql.mock.reset",
  "mysql.elastic.execute",
  "mysql.elastic.document",
  "mysql.elastic.copyAsCurl",
  "mysql.elastic.lint",
  "mysql.template.ddl.reset",
  "mysql.kafka.topic.produce.send",
  "mysql.kafka.topic.producer.kill",
  "mysql.kafka.consumer.start",
  "mysql.kafka.consumer.stop",
  "mysql.kafka.consumer.configOffset",
  "mysql.docker.compose.pull",
  "mysql.redis.loadMore",
  "mysql.variable.config.display",
];
const registeredCommands = [];
const registeredProviders = [];
const registeredContentProviders = [];
const registeredFileSystems = [];
const registeredTreeViews = [];
const registeredCustomEditors = [];
const registeredSerializers = [];
const registeredAuthProviders = [];
const registeredUriHandlers = [];
const registeredWebviewViews = [];
const outputLines = [];

function disposable(onDispose = () => {}) {
  let disposed = false;
  return {
    dispose() {
      if (!disposed) {
        disposed = true;
        onDispose();
      }
    },
  };
}

const outputChannel = {
  appendLine(value) {
    outputLines.push(value);
  },
  dispose() {},
};
const vscodeStub = {
  TreeItem: class {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  ThemeIcon: class {
    constructor(id) {
      this.id = id;
    }
  },
  ThemeColor: class {
    constructor(id) {
      this.id = id;
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  EventEmitter: class {
    constructor() {
      this.event = () => disposable();
    }
    fire() {}
    dispose() {}
  },
  Diagnostic: class {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
  },
  window: {
    createOutputChannel: () => outputChannel,
    createTreeView: (id, options) => {
      registeredTreeViews.push({ id, options });
      return {
        ...disposable(),
        onDidChangeVisibility: () => disposable(),
      };
    },
    showTextDocument: async () => undefined,
    showErrorMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    onDidChangeActiveTextEditor: () => disposable(),
    onDidChangeTextEditorSelection: () => disposable(),
    activeTextEditor: undefined,
    visibleTextEditors: [],
    createTextEditorDecorationType: () => disposable(),
    registerUriHandler: (handler) => {
      registeredUriHandlers.push(handler);
      return disposable();
    },
    registerWebviewViewProvider: (viewType, provider) => {
      registeredWebviewViews.push({ viewType, provider });
      return disposable();
    },
    registerCustomEditorProvider: (viewType, provider, options) => {
      registeredCustomEditors.push({ viewType, provider, options });
      return disposable();
    },
    registerWebviewPanelSerializer: (viewType, serializer) => {
      registeredSerializers.push({ viewType, serializer });
      return disposable();
    },
  },
  workspace: {
    getConfiguration: () => ({
      get: (_key, fallback) => fallback,
      update: async () => undefined,
    }),
    openTextDocument: async (document) => document,
    onDidChangeTextDocument: () => disposable(),
    onDidCloseTextDocument: () => disposable(),
    registerNotebookSerializer: () => disposable(),
    registerTextDocumentContentProvider: (scheme, provider) => {
      registeredContentProviders.push({ scheme, provider });
      return disposable();
    },
    registerFileSystemProvider: (scheme, provider, options) => {
      registeredFileSystems.push({ scheme, provider, options });
      return disposable();
    },
  },
  commands: {
    registerCommand: (id, handler) => {
      registeredCommands.push({ id, handler });
      return disposable();
    },
  },
  authentication: {
    registerAuthenticationProvider: (id, label, provider) => {
      registeredAuthProviders.push({ id, label, provider });
      return disposable();
    },
  },
  languages: {
    createDiagnosticCollection: () => ({
      set() {},
      delete() {},
      dispose() {},
    }),
    registerCompletionItemProvider: (...args) => {
      registeredProviders.push(args);
      return disposable();
    },
    registerCodeLensProvider: (...args) => {
      registeredProviders.push(args);
      return disposable();
    },
    registerDocumentRangeFormattingEditProvider: (...args) => {
      registeredProviders.push(args);
      return disposable();
    },
    registerDocumentFormattingEditProvider: (...args) => {
      registeredProviders.push(args);
      return disposable();
    },
    registerDocumentSymbolProvider: (...args) => {
      registeredProviders.push(args);
      return disposable();
    },
    registerFoldingRangeProvider: (...args) => {
      registeredProviders.push(args);
      return disposable();
    },
    registerHoverProvider: (...args) => {
      registeredProviders.push(args);
      return disposable();
    },
    registerSignatureHelpProvider: (...args) => {
      registeredProviders.push(args);
      return disposable();
    },
    registerCodeActionsProvider: (...args) => {
      registeredProviders.push(args);
      return disposable();
    },
    registerDefinitionProvider: (...args) => {
      registeredProviders.push(args);
      return disposable();
    },
    registerWorkspaceSymbolProvider: (...args) => {
      registeredProviders.push(args);
      return disposable();
    },
  },
  env: {
    appName: "Database Client",
    language: "en",
    machineId: "activation-smoke-machine",
    remoteName: "activation-smoke",
    uiKind: 2,
    clipboard: {
      writeText: async () => undefined,
    },
    asExternalUri: async (uri) => uri,
    openExternal: async () => true,
  },
  UIKind: {
    Desktop: 1,
    Web: 2,
  },
  ViewColumn: {
    One: 1,
  },
  Uri: {
    parse: (value) => ({ toString: () => value }),
    joinPath: (...segments) => ({ fsPath: segments.join(path.sep) }),
  },
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "vscode") {
    return vscodeStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const require = createRequire(import.meta.url);
  const extension = require(extensionBundle);
  const context = {
    extensionUri: { fsPath: projectRoot },
    extensionPath: projectRoot,
    globalStorageUri: { fsPath: path.join(projectRoot, ".activation-global") },
    extension: { id: "cweijan.vscode-database-client2" },
    subscriptions: [],
    globalState: {
      get: () => undefined,
      update: async () => undefined,
      keys: () => [],
    },
    workspaceState: {
      get: (_key, fallback) => fallback,
      update: async () => undefined,
      keys: () => [],
    },
  };

  extension.activate(context);
  assert.equal(
    registeredCommands.length,
    expectedCommands.length + expectedInternalCommands.length,
  );
  assert.deepEqual(
    registeredCommands.map(({ id }) => id).sort(),
    [...expectedCommands, ...expectedInternalCommands].sort(),
  );
  assert.equal(registeredProviders.length, 21);
  assert.deepEqual(
    registeredContentProviders.map(({ scheme }) => scheme),
    ["db_ddl"],
  );
  assert.deepEqual(
    registeredFileSystems.map(({ scheme }) => scheme).sort(),
    ["dbclient-fs", "dbclient-ftp"],
  );
  assert.deepEqual(
    registeredCustomEditors.map(({ viewType }) => viewType).sort(),
    ["dbclient.dbFile", "dbclient.parquet"],
  );
  assert.deepEqual(
    registeredSerializers.map(({ viewType }) => viewType).sort(),
    ["cloudService", "dockerLogs", "forward", "lokiLog", "redisKey", "result", "sshTerminal"],
  );
  assert.deepEqual(
    registeredAuthProviders.map(({ id, label }) => ({ id, label })),
    [{ id: "dbclient.auth", label: "Database Client" }],
  );
  assert.equal(registeredUriHandlers.length, 1);
  assert.deepEqual(
    registeredWebviewViews.map(({ viewType }) => viewType),
    ["dbclinet.variable.config.view"],
  );
  assert.deepEqual(
    registeredTreeViews.map(({ id }) => id).sort(),
    ["github.cweijan.mysql", "github.cweijan.nosql", "github.dbclient.history"],
  );
  assert.ok(
    outputLines.some((line) => line.includes("Modern source build activated")),
  );
  extension.deactivate();
  console.log(
    `Modern activation smoke passed: ${registeredCommands.length} commands, ${registeredProviders.length} provider registration.`,
  );
} finally {
  Module._load = originalLoad;
}
