import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";

function queryValues(query: string): Readonly<Record<string, string>> {
  return Object.fromEntries(new URLSearchParams(query).entries());
}

export class ModernSiteUriHandler implements vscode.UriHandler {
  public constructor(private readonly services: ExtensionServices) {}

  public async handleUri(uri: vscode.Uri): Promise<void> {
    if (uri.path !== "/login") return;
    const query = queryValues(uri.query);
    if (!query.sign) return;

    try {
      await this.services.cloud.setUser(query);
      await vscode.window.showInformationMessage(
        "Successfully signed in to Database Client.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await vscode.window.showErrorMessage(`Database Client sign-in failed: ${message}`);
    }
  }
}

export function registerModernUriHandler(
  services: ExtensionServices,
): vscode.Disposable {
  return vscode.window.registerUriHandler(new ModernSiteUriHandler(services));
}

export { queryValues };
