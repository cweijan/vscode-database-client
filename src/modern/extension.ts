import * as vscode from "vscode";

import { createModernCommandHost } from "./commands/modernCommandHost";
import { registerTargetCommands } from "./commands/targetCommandDispatcher";
import { createExtensionServices } from "./core/extensionServices";
import { registerModernTreeViews } from "./tree/databaseTreeProvider";
import { registerModernLanguageProviders } from "./providers/vscodeLanguageProviders";

const outputChannelName = "Database Client (modern source)";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(outputChannelName);
  const services = createExtensionServices(context, output);
  output.appendLine(
    "Modern source build activated; domain services are migrated incrementally.",
  );
  context.subscriptions.push(output);
  context.subscriptions.push(services);
  context.subscriptions.push(...registerModernTreeViews(context, services));
  context.subscriptions.push(
    ...registerTargetCommands(undefined, undefined, createModernCommandHost(services)),
  );
  context.subscriptions.push(...registerModernLanguageProviders());
}

export function deactivate(): void {
  // The host owns all disposable resources registered through the context.
}
