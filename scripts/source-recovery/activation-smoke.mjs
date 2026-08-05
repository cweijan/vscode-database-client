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
const registeredCommands = [];
const registeredProviders = [];
const registeredTreeViews = [];
const registeredCustomEditors = [];
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
  window: {
    createOutputChannel: () => outputChannel,
    createTreeView: (id, options) => {
      registeredTreeViews.push({ id, options });
      return disposable();
    },
    showTextDocument: async () => undefined,
    showErrorMessage: async () => undefined,
    registerCustomEditorProvider: (viewType, provider, options) => {
      registeredCustomEditors.push({ viewType, provider, options });
      return disposable();
    },
  },
  workspace: {
    getConfiguration: () => ({
      get: (_key, fallback) => fallback,
      update: async () => undefined,
    }),
    openTextDocument: async (document) => document,
  },
  commands: {
    registerCommand: (id, handler) => {
      registeredCommands.push({ id, handler });
      return disposable();
    },
  },
  languages: {
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
    clipboard: {
      writeText: async () => undefined,
    },
  },
  ViewColumn: {
    One: 1,
  },
  Uri: {
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
    subscriptions: [],
    workspaceState: {
      get: (_key, fallback) => fallback,
      update: async () => undefined,
    },
  };

  extension.activate(context);
  assert.equal(registeredCommands.length, expectedCommands.length);
  assert.deepEqual(
    registeredCommands.map(({ id }) => id).sort(),
    [...expectedCommands].sort(),
  );
  assert.equal(registeredProviders.length, 21);
  assert.deepEqual(
    registeredCustomEditors.map(({ viewType }) => viewType).sort(),
    ["dbclient.dbFile", "dbclient.parquet"],
  );
  assert.deepEqual(
    registeredTreeViews.map(({ id }) => id).sort(),
    ["github.cweijan.mysql", "github.cweijan.nosql"],
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
