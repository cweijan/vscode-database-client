import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";

import * as vscode from "vscode";

import { VscodeResourceResolver } from "./resources";
import { renderWebviewHtml } from "./webviewHtml";

export async function renderPackagedWebviewHtml(
  extensionUri: vscode.Uri,
  webview: vscode.Webview,
  config: unknown,
  entry = "out/webview/app.html",
): Promise<string> {
  const resolver = new VscodeResourceResolver(extensionUri);
  const template = await fs.readFile(resolver.resolve(...entry.split("/")), "utf8");
  const nonce = randomBytes(16).toString("base64");
  return renderWebviewHtml(template, {
    cspSource: webview.cspSource,
    nonce,
    config,
    resolveAsset: (asset) =>
      webview
        .asWebviewUri(
          vscode.Uri.joinPath(
            extensionUri,
            "out",
            "webview",
            ...asset.replace(/^\.?\//, "").split("/"),
          ),
        )
        .toString(),
  });
}
