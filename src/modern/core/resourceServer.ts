import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as path from "node:path";

import * as vscode from "vscode";

import type { Disposable, Logger } from "./contracts";

export interface ResourceServerOptions {
  readonly documentationHost?: string;
  readonly preferredPort?: number;
  readonly staticOnly?: boolean;
}

export type ResourceBindHandler = (
  query: Readonly<Record<string, string>>,
) => Promise<void>;

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentType(filePath: string): string {
  return contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function safeFilePath(root: string, requestPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return undefined;
  }
  const segments = decoded.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    return undefined;
  }
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, ...segments);
  const relative = path.relative(resolvedRoot, candidate);
  if (relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    return undefined;
  }
  return candidate;
}

function listen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Resource server did not expose a TCP address"));
        return;
      }
      resolve(address.port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

function jsonResponse(response: http.ServerResponse, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(body);
}

export class ResourceServer implements Disposable {
  private server: http.Server | undefined;
  private port: number | undefined;
  private starting: Promise<void> | undefined;
  private bindHandler: ResourceBindHandler | undefined;

  private readonly staticOnly: boolean;
  private readonly preferredPort: number;
  private readonly documentationHost: string;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly logger: Logger,
    options: ResourceServerOptions = {},
  ) {
    this.staticOnly = options.staticOnly ?? vscode.env.uiKind === vscode.UIKind.Web;
    this.preferredPort = options.preferredPort ?? 8828;
    this.documentationHost = (options.documentationHost || "https://database-client.com")
      .replace(/\/+$/, "");
  }

  public setBindHandler(handler: ResourceBindHandler | undefined): void {
    this.bindHandler = handler;
  }

  public async start(): Promise<void> {
    if (this.staticOnly || this.server || this.starting) {
      return this.starting ?? Promise.resolve();
    }
    this.starting = this.bind().finally(() => {
      this.starting = undefined;
    });
    await this.starting;
  }

  public async getHost(): Promise<string | undefined> {
    if (this.staticOnly) {
      return undefined;
    }
    await this.start();
    if (!this.port) {
      return undefined;
    }
    try {
      return (await vscode.env.asExternalUri(
        vscode.Uri.parse(`http://127.0.0.1:${this.port}`),
      )).toString();
    } catch (error) {
      this.logger.warn("Unable to expose the resource server externally", error);
      return `http://127.0.0.1:${this.port}`;
    }
  }

  public getPort(): number | undefined {
    return this.port;
  }

  public dispose(): void {
    const server = this.server;
    this.server = undefined;
    this.port = undefined;
    if (server) {
      server.close();
    }
  }

  private createServer(): http.Server {
    return http.createServer((request, response) => {
      void this.handle(request, response);
    });
  }

  private async bind(): Promise<void> {
    let server = this.createServer();
    try {
      this.port = await listen(server, this.preferredPort);
    } catch (error) {
      server.close();
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
        this.logger.error("Unable to start the resource server", error);
        return;
      }
      server = this.createServer();
      try {
        this.port = await listen(server, 0);
      } catch (fallbackError) {
        server.close();
        this.logger.error("Unable to start the resource server on a fallback port", fallbackError);
        return;
      }
    }
    this.server = server;
    this.logger.info(`Resource server started on port ${this.port}`);
  }

  private async handle(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    response.setHeader("Access-Control-Allow-Origin", "*");
    if (request.method === "OPTIONS") {
      response.writeHead(200);
      response.end();
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(request.url || "/", "http://127.0.0.1");
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }

    if (parsed.pathname === "/extension/alive") {
      jsonResponse(response, { alive: true });
      return;
    }
    if (parsed.pathname === "/extension/bind") {
      const query = Object.fromEntries(parsed.searchParams.entries());
      if (!query.sign) {
        jsonResponse(response, { error: "Invalid auth!" });
        return;
      }
      try {
        await this.bindHandler?.(query);
        jsonResponse(response, { success: true });
      } catch (error) {
        jsonResponse(response, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (parsed.pathname === "/docs" || parsed.pathname.startsWith("/docs/")) {
      const suffix = parsed.pathname.slice("/docs".length) || "/";
      response.writeHead(302, {
        Location: `${this.documentationHost}/docs${suffix}${parsed.search}`,
      });
      response.end();
      return;
    }

    const resourceRoot = parsed.pathname.startsWith("/resources/")
      ? this.extensionUri.fsPath
      : vscode.Uri.joinPath(this.extensionUri, "out", "webview").fsPath;
    const resourcePath = parsed.pathname.startsWith("/resources/")
      ? parsed.pathname.slice("/resources/".length)
      : parsed.pathname;
    const candidate = safeFilePath(resourceRoot, resourcePath);
    if (!candidate) {
      response.writeHead(400);
      response.end();
      return;
    }

    try {
      const stat = await fs.stat(candidate);
      const filePath = stat.isDirectory() ? path.join(candidate, "index.html") : candidate;
      const content = await fs.readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": "public, max-age=604800",
        Expires: new Date(Date.now() + 604800000).toUTCString(),
        "Content-Type": contentType(filePath),
      });
      response.end(content);
    } catch {
      if (parsed.pathname === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<!doctype html><title>Database Client Resource Server</title>");
        return;
      }
      response.writeHead(404);
      response.end();
    }
  }
}

export { contentType, safeFilePath };
