import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import * as path from "node:path";

import { parse as parseJsonWithComments } from "comment-json";
import * as vscode from "vscode";

import type { Logger } from "./contracts";
import {
  connectionConfigKey,
  ConnectionConfigStore,
} from "./connectionConfigStore";
import type { CloudConfigSyncService, CloudSyncType } from "./cloudConfigSyncService";
import type { ConnectionOptions } from "../database/types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseConfig(value: string): Record<string, unknown> {
  return record(parseJsonWithComments(value) as unknown);
}

export class ConnectionConfigService {
  private readonly saveSubscription: vscode.Disposable;
  private readonly openFiles = new Map<string, boolean>();

  public constructor(
    private readonly connections: ConnectionConfigStore,
    private readonly sync: CloudConfigSyncService,
    private readonly logger: Logger,
    private readonly rootPath: string,
  ) {
    this.saveSubscription = typeof vscode.workspace.onDidSaveTextDocument === "function"
      ? vscode.workspace.onDidSaveTextDocument((document) => {
        void this.applySavedConfig(document);
      })
      : { dispose: () => undefined };
  }

  public config(workspace = false): ReturnType<ConnectionConfigStore["config"]> {
    return this.connections.config(workspace);
  }

  public async saveConnection(
    connection: ConnectionOptions,
    globalScope?: boolean,
  ): Promise<void> {
    const workspace = globalScope === undefined
      ? this.connections.isWorkspaceConfigured()
      : !globalScope;
    const stored = { ...connection } as ConnectionOptions & Record<string, unknown>;
    delete stored.global;
    delete stored.isGlobal;
    const entry = { [connection.id]: stored };
    if (connectionConfigKey(connection.type) === "database.connections") {
      await this.connections.updateScope(workspace, entry, undefined, true);
    } else {
      await this.connections.updateScope(workspace, undefined, entry, true);
    }
  }

  public async open(workspace = false): Promise<vscode.TextEditor> {
    const filePath = path.resolve(
      this.rootPath,
      workspace ? "workspace-config.jsonc" : "config.jsonc",
    );
    await mkdir(this.rootPath, { recursive: true });
    await unlink(filePath).catch(() => undefined);
    this.openFiles.set(filePath, workspace);
    const content = [
      "// This file is a temporary view; saving it updates the stored connection configuration.",
      JSON.stringify(this.config(workspace), null, 2),
    ].join("\n");
    await writeFile(filePath, content, "utf8");
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    return vscode.window.showTextDocument(document);
  }

  public async exportConfig(workspace = false, withQueryFiles = false): Promise<boolean> {
    const extension = withQueryFiles ? "zip" : "json";
    const file = await vscode.window.showSaveDialog({
      saveLabel: "Export configuration",
      filters: withQueryFiles ? { ZIP: ["zip"] } : { JSON: ["json"] },
      defaultUri: vscode.Uri.file(
        path.join(
          "database-client" + (workspace ? "-workspace" : "") + "-config." + extension,
        ),
      ),
    });
    if (!file) return false;
    const content = withQueryFiles
      ? await this.sync.exportArchive(undefined, workspace)
      : Buffer.from(JSON.stringify(this.config(workspace), null, 2), "utf8");
    await writeFile(file.fsPath, content);
    return true;
  }

  public async importConfig(
    type: CloudSyncType = "",
    workspace = false,
  ): Promise<boolean> {
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: "Import configuration",
      filters: { JSON: ["json", "jsonc"], ZIP: ["zip"] },
    });
    const file = files?.[0];
    if (!file) return false;
    if (path.extname(file.fsPath).toLocaleLowerCase() === ".zip") {
      await this.sync.importArchive(
        await readFile(file.fsPath),
        { type, workspace },
      );
      return true;
    }
    const source = parseConfig(await readFile(file.fsPath, "utf8"));
    await this.connections.updateScope(
      workspace,
      source.database,
      source.nosql,
      type === "merge",
    );
    this.logger.debug("Connection configuration imported", {
      workspace,
      database: source.database !== undefined,
      nosql: source.nosql !== undefined,
    });
    return source.database !== undefined || source.nosql !== undefined;
  }

  public dispose(): void {
    this.saveSubscription.dispose();
    for (const filePath of this.openFiles.keys()) {
      void unlink(filePath).catch(() => undefined);
    }
    this.openFiles.clear();
  }

  private async updateConnections(
    database: unknown,
    nosql: unknown,
    workspace: boolean,
  ): Promise<void> {
    await this.connections.updateScope(workspace, database, nosql, false);
  }

  private async applySavedConfig(document: vscode.TextDocument): Promise<void> {
    const filePath = path.resolve(document.uri.fsPath);
    const workspace = this.openFiles.get(filePath);
    if (workspace === undefined && !this.openFiles.has(filePath)) return;
    const isWorkspace = workspace === true;
    try {
      const source = parseConfig(document.getText());
      await this.updateConnections(source.database, source.nosql, isWorkspace);
      this.logger.debug("Connection configuration saved", { workspace: isWorkspace });
      this.openFiles.delete(filePath);
      await unlink(filePath).catch(() => undefined);
    } catch (error) {
      this.logger.error("Unable to parse saved connection configuration", error);
      await vscode.window.showErrorMessage("Parse connect config fail!");
    }
  }
}
