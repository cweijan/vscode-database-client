import * as vscode from "vscode";

import type { ActiveConnectionStore } from "../core/activeConnection";
import type { Disposable } from "../core/contracts";
import type { ConnectionManager } from "../database/connectionManager";

import { parseDockerComposeImages, type DockerComposeImage } from "./dockerComposeParser";

export { parseDockerComposeImages } from "./dockerComposeParser";
export type { DockerComposeImage } from "./dockerComposeParser";

function composeSource(value: unknown): string {
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const document = candidate.document && typeof candidate.document === "object"
    ? candidate.document
    : value;
  const documentRecord = document && typeof document === "object" && !Array.isArray(document)
    ? document as Record<string, unknown>
    : {};
  const getText = documentRecord.getText;
  if (typeof getText === "function") return String(getText.call(document));
  return vscode.window.activeTextEditor?.document.getText() || "";
}

export class DockerComposeService implements Disposable {
  public constructor(
    private readonly activeConnection: ActiveConnectionStore,
    private readonly connections: ConnectionManager,
  ) {}

  public async pull(target?: unknown): Promise<readonly DockerComposeImage[]> {
    const source = composeSource(target);
    if (!source.trim()) throw new Error("The active Docker Compose document is empty");
    const images = parseDockerComposeImages(source);
    if (!images.length) {
      throw new Error("The Docker Compose document has no service images to pull");
    }
    const connection = this.activeConnection.get();
    if (!connection || connection.type !== "Docker") {
      throw new Error("An active Docker connection is required");
    }
    for (const { image } of images) {
      await this.connections.query(
        connection,
        `POST /images/create?fromImage=${encodeURIComponent(image)}`,
      );
    }
    void vscode.window.showInformationMessage(`Pulled ${images.length} Docker image(s).`);
    return images;
  }

  public dispose(): void {}
}
