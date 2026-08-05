import * as path from "node:path";

import * as vscode from "vscode";

import type { ResourceResolver } from "./contracts";

export class FileResourceResolver implements ResourceResolver {
  public constructor(private readonly root: string) {}

  public resolve(...segments: string[]): string {
    return path.join(this.root, ...segments);
  }
}

export class VscodeResourceResolver implements ResourceResolver {
  public constructor(private readonly extensionUri: vscode.Uri) {}

  public resolve(...segments: string[]): string {
    return vscode.Uri.joinPath(this.extensionUri, ...segments).fsPath;
  }

  public webviewUri(webview: vscode.Webview, ...segments: string[]): vscode.Uri {
    return webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...segments));
  }
}
