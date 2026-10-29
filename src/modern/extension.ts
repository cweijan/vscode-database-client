import * as vscode from "vscode";

import { createModernCommandHost } from "./commands/modernCommandHost";
import { registerInternalCommands } from "./commands/internalCommandDispatcher";
import { registerTargetCommands } from "./commands/targetCommandDispatcher";
import { createExtensionServices } from "./core/extensionServices";
import { registerModernTreeViews } from "./tree/databaseTreeProvider";
import { registerModernHistoryView } from "./tree/sqlHistoryProvider";
import { registerModernLanguageProviders } from "./providers/vscodeLanguageProviders";
import { registerModernCustomEditors } from "./providers/customEditors";
import { registerModernWebviewSerializers } from "./providers/webviewSerializers";
import { registerModernAuthentication } from "./providers/authenticationProvider";
import { registerModernUriHandler } from "./providers/siteUriHandler";
import { ModernSqlDiagnostics } from "./providers/sqlDiagnostics";
import { registerModernSqlVariables } from "./providers/sqlVariableProvider";
import { ModernRemoteFileSystemProvider } from "./remote/fileSystemProvider";

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
  context.subscriptions.push(...registerModernHistoryView(services));
  const commandHost = createModernCommandHost(services);
  context.subscriptions.push(
    ...registerTargetCommands(undefined, undefined, commandHost),
  );
  context.subscriptions.push(...registerInternalCommands(commandHost));
  context.subscriptions.push(...registerModernLanguageProviders(services));
  context.subscriptions.push(...registerModernCustomEditors(services));
  context.subscriptions.push(...registerModernWebviewSerializers(services));
  context.subscriptions.push(...registerModernAuthentication(services));
  context.subscriptions.push(registerModernUriHandler(services));
  context.subscriptions.push(new ModernSqlDiagnostics());
  context.subscriptions.push(...registerModernSqlVariables(services));
  const fileSystemProvider = new ModernRemoteFileSystemProvider(services);
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(
      "dbclient-fs",
      fileSystemProvider,
      { isCaseSensitive: true },
    ),
    vscode.workspace.registerFileSystemProvider(
      "dbclient-ftp",
      fileSystemProvider,
      { isCaseSensitive: true },
    ),
  );
}

export function deactivate(): void {
  // The host owns all disposable resources registered through the context.
}
