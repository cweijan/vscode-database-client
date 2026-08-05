import type * as vscode from "vscode";

import type { Disposable } from "../core/contracts";
import { CommandRegistry } from "./commandRegistry";
import { VscodeCommandRegistrar } from "./vscodeCommandRegistrar";

export interface SqlCommandTarget {
  readonly label?: string;
  readonly contextValue?: string;
  showDdl?(): string | Promise<string>;
  getPaginationSql?(): string;
}

export interface TableCommandHost {
  writeClipboard(value: string): Promise<void> | Thenable<void>;
  openSqlDocument(content: string): PromiseLike<unknown>;
  showTextDocument(document: unknown): PromiseLike<unknown>;
}

export function createVscodeTableCommandHost(): TableCommandHost {
  const vscodeModule = require("vscode") as typeof import("vscode");
  return {
    writeClipboard: (value) => vscodeModule.env.clipboard.writeText(value),
    openSqlDocument: async (content) =>
      await vscodeModule.workspace.openTextDocument({
        content,
        language: "sql",
      }),
    showTextDocument: async (document) =>
      await vscodeModule.window.showTextDocument(
        document as vscode.TextDocument,
      ),
  };
}

function requireTarget(value: unknown): SqlCommandTarget {
  if (!value || typeof value !== "object") {
    throw new Error("A database tree target is required");
  }
  return value as SqlCommandTarget;
}

export function registerTableCommandHandlers(
  registrar: VscodeCommandRegistrar,
  host: TableCommandHost = createVscodeTableCommandHost(),
): Disposable[] {
  return [
    registrar.registerCommand("mysql.name.copy", async (value: unknown) => {
      const target = requireTarget(value);
      if (!target.label) {
        throw new Error("The selected target has no name");
      }
      await host.writeClipboard(target.label);
      return target.label;
    }),
    registrar.registerCommand("mysql.table.source", async (value: unknown) => {
      const target = requireTarget(value);
      if (!target.showDdl) {
        throw new Error("The selected target has no DDL source");
      }
      const source = await target.showDdl();
      const document = await host.openSqlDocument(source);
      await host.showTextDocument(document);
      return source;
    }),
    registrar.registerCommand("mysql.template.table.select", async (value: unknown) => {
      const target = requireTarget(value);
      if (!target.getPaginationSql) {
        throw new Error("The selected target has no query template");
      }
      const document = await host.openSqlDocument(target.getPaginationSql());
      await host.showTextDocument(document);
      return document;
    }),
  ];
}

export function registerTableCommands(): Disposable[] {
  const commands = new CommandRegistry();
  const vscodeModule = require("vscode") as typeof import("vscode");
  const registrar = new VscodeCommandRegistrar(
    commands,
    vscodeModule.commands.registerCommand.bind(vscodeModule.commands),
  );
  return registerTableCommandHandlers(registrar);
}
