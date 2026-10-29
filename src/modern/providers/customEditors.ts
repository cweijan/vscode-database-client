import * as path from "node:path";

import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { TypedWebviewHandler } from "../core/webviewHandler";
import type { ConnectionOptions } from "../database/types";

interface BinaryDocumentBackup {
  readonly id: string;
  readonly delete: () => void | Thenable<void>;
}

class ModernBinaryDocument implements vscode.CustomDocument {
  public constructor(
    public readonly uri: vscode.Uri,
    public content: Uint8Array,
  ) {}

  public dispose(): void {}
}

type CustomDocumentChange = vscode.CustomDocumentContentChangeEvent<ModernBinaryDocument>;

type BinaryEditorRoute = "dbFileConnect" | "sqlite" | "parquet";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

class BinaryDocumentProvider implements vscode.CustomEditorProvider<ModernBinaryDocument> {
  private readonly changes = new vscode.EventEmitter<CustomDocumentChange>();
  private readonly handlers = new Map<string, TypedWebviewHandler>();
  private readonly pendingSaves = new Map<string, {
    readonly resolve: (content: Uint8Array) => void;
    readonly reject: (error: Error) => void;
  }>();

  public readonly onDidChangeCustomDocument = this.changes.event;

  public constructor(
    private readonly services: ExtensionServices,
    private readonly route: "database" | "parquet",
  ) {}

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<ModernBinaryDocument> {
    const source = openContext.backupId
      ? vscode.Uri.parse(openContext.backupId)
      : uri;
    return new ModernBinaryDocument(uri, await vscode.workspace.fs.readFile(source));
  }

  public async saveCustomDocument(
    document: ModernBinaryDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    document.content = await this.requestContent(document);
    await vscode.workspace.fs.writeFile(document.uri, document.content);
  }

  public async saveCustomDocumentAs(
    document: ModernBinaryDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    document.content = await this.requestContent(document);
    await vscode.workspace.fs.writeFile(destination, document.content);
  }

  public async revertCustomDocument(
    document: ModernBinaryDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    document.content = await vscode.workspace.fs.readFile(document.uri);
    await this.handlers.get(document.uri.toString())?.send("open", this.openPayload(document));
  }

  public async backupCustomDocument(
    document: ModernBinaryDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    document.content = await this.requestContent(document);
    await vscode.workspace.fs.writeFile(context.destination, document.content);
    const backup: BinaryDocumentBackup = {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination, { useTrash: false }),
    };
    return backup;
  }

  public async resolveCustomEditor(
    document: ModernBinaryDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const route = this.routeFor(document.uri);
    await this.services.webviews.createWebviewPanel({
      title: path.basename(document.uri.fsPath),
      type: route,
      id: `${route}:${document.uri.toString()}`,
      route,
      singlePage: false,
      webviewPanel: panel,
      state: this.openPayload(document),
      eventHandler: (handler) => this.bindEvents(document, panel, handler),
    });
  }

  public dispose(): void {
    this.changes.dispose();
    for (const pending of this.pendingSaves.values()) {
      pending.reject(new Error("Custom editor disposed"));
    }
    this.pendingSaves.clear();
    this.handlers.clear();
  }

  private openPayload(document: ModernBinaryDocument): Record<string, unknown> {
    return {
      fileName: path.basename(document.uri.fsPath),
      data: Array.from(document.content),
      route: this.routeFor(document.uri),
    };
  }

  private routeFor(uri: vscode.Uri): BinaryEditorRoute {
    if (this.route === "parquet") return "parquet";
    const extension = path.extname(uri.fsPath).toLowerCase();
    return extension === ".ddb" || extension === ".duckdb"
      ? "dbFileConnect"
      : "sqlite";
  }

  private bindEvents(
    document: ModernBinaryDocument,
    panel: vscode.WebviewPanel,
    handler: TypedWebviewHandler,
  ): void {
    const route = this.routeFor(document.uri);
    const key = document.uri.toString();
    this.handlers.set(key, handler);
    handler.on("init", async () => {
      if (route === "sqlite") {
        await handler.send("open", this.openPayload(document));
      } else if (route !== "parquet") {
        await this.sendDatabaseFileInfo(document, handler, false);
      } else {
        await handler.send("open", this.openPayload(document));
      }
    });
    handler.on("connecting", async (content) => {
      if (route !== "dbFileConnect") return;
      try {
        await this.connectDatabaseFile(document, handler, content);
      } catch (error) {
        await handler.send("error", error instanceof Error ? error.message : String(error));
      }
    });
    handler.on("reveal", async () => {
      await vscode.commands.executeCommand("revealInExplorer", document.uri);
    });
    handler.on("installDependency", async () => {
      await handler.send("option", { dependency: { sqlite3: true, duckDB: true } });
    });
    handler.on("openSite", async (content) => {
      const page = text(content, "");
      if (page) {
        await vscode.env.openExternal(vscode.Uri.parse(`https://database-client.com/${page}`));
      }
    });
    handler.on("markDirty", () => this.changes.fire({ document }));
    handler.on("saveContent", (content) => {
      const pending = this.pendingSaves.get(key);
      if (!pending) return;
      this.pendingSaves.delete(key);
      const bytes = Array.isArray((content as { data?: unknown })?.data)
        ? (content as { data: unknown[] }).data.map(Number)
        : [];
      pending.resolve(Uint8Array.from(bytes));
    });
    handler.on("saveContentError", (content) => {
      const pending = this.pendingSaves.get(key);
      if (!pending) return;
      this.pendingSaves.delete(key);
      pending.reject(new Error(String(content || "Unable to collect document content")));
    });
    handler.on("save", async () => {
      try {
        document.content = await this.requestContent(document);
        await vscode.workspace.fs.writeFile(document.uri, document.content);
      } catch (error) {
        await handler.send("saveError", error instanceof Error ? error.message : String(error));
      }
    });
    handler.on("revert", async () => {
      document.content = await vscode.workspace.fs.readFile(document.uri);
      await handler.send("open", this.openPayload(document));
    });
    panel.onDidDispose(() => {
      if (this.handlers.get(key) === handler) {
        this.handlers.delete(key);
      }
      const pending = this.pendingSaves.get(key);
      if (pending) {
        this.pendingSaves.delete(key);
        pending.reject(new Error("Custom editor panel disposed"));
      }
    });
  }

  private async connectDatabaseFile(
    document: ModernBinaryDocument,
    handler: TypedWebviewHandler,
    content: unknown,
  ): Promise<void> {
    const payload = record(content);
    const config = record(payload.connectionOption);
    const type = text(config.dbType, "SQLite");
    const connection: ConnectionOptions = {
      id: `dbfile:${document.uri.toString()}`,
      name: text(config.name, path.basename(document.uri.fsPath)),
      type,
      dbPath: text(config.dbPath, document.uri.fsPath),
      options: {
        readonly: false,
      },
    };
    const records = this.services.state.get<Record<string, unknown>>("database.connections", {});
    await this.services.state.update("database.connections", { ...records, [connection.id]: connection });
    await this.services.connections.getConnection(connection);
    this.services.activeConnection.set(connection);
    await this.sendDatabaseFileInfo(document, handler, true, connection);
    await handler.send("success", { message: `Connected to ${connection.name}.` });
  }

  private async sendDatabaseFileInfo(
    document: ModernBinaryDocument,
    handler: TypedWebviewHandler,
    connected: boolean,
    connection?: ConnectionOptions,
  ): Promise<void> {
    const selected = connection || (connected ? this.services.activeConnection.get() : undefined);
    const groups: Array<Record<string, unknown>> = [];
    if (connected && selected) {
      const dialect = this.services.dialects.resolve(selected.type);
      if (dialect.showTables) {
        const result = await this.services.connections.query(selected, dialect.showTables(selected.schema));
        for (const row of result.rows as Array<Record<string, unknown>>) {
          groups.push({
            name: text(row.name || row.table_name || row.TABLE_NAME),
            type: text(row.type, "table").toLowerCase(),
            rowCount: row.rowCount,
          });
        }
      }
    }
    await handler.send("fileInfo", {
      connected,
      dbType: selected?.type || "SQLite",
      dbPath: selected?.dbPath || document.uri.fsPath,
      name: selected?.name || path.basename(document.uri.fsPath).replace(/\.[^.]+$/, ""),
      fileName: path.basename(document.uri.fsPath),
      groups,
    });
  }

  private requestContent(document: ModernBinaryDocument): Promise<Uint8Array> {
    const key = document.uri.toString();
    const handler = this.handlers.get(key);
    if (!handler) return Promise.resolve(document.content);
    return new Promise<Uint8Array>((resolve, reject) => {
      this.pendingSaves.set(key, { resolve, reject });
      void handler.send("requestSave");
      setTimeout(() => {
        const pending = this.pendingSaves.get(key);
        if (!pending) return;
        this.pendingSaves.delete(key);
        pending.reject(new Error("Custom editor save request timed out"));
      }, 30_000);
    });
  }
}

export function registerModernCustomEditors(
  services: ExtensionServices,
): vscode.Disposable[] {
  const dbFileProvider = new BinaryDocumentProvider(services, "database");
  const parquetProvider = new BinaryDocumentProvider(services, "parquet");
  const options = {
    supportsMultipleEditorsPerDocument: true,
    webviewOptions: { retainContextWhenHidden: true },
  };
  const dbFileRegistration = vscode.window.registerCustomEditorProvider(
    "dbclient.dbFile",
    dbFileProvider,
    options,
  );
  const parquetRegistration = vscode.window.registerCustomEditorProvider(
    "dbclient.parquet",
    parquetProvider,
    options,
  );
  const disposable: vscode.Disposable = {
    dispose: () => {
      dbFileRegistration.dispose();
      parquetRegistration.dispose();
      dbFileProvider.dispose();
      parquetProvider.dispose();
    },
  };
  return [disposable];
}
