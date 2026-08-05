import * as vscode from "vscode";

import type { Disposable, Logger } from "./contracts";
import { renderPackagedWebviewHtml } from "./vscodeWebviewHtml";
import { TypedWebviewHandler, type HostWebview } from "./webviewHandler";

export interface ModernWebviewPanelOptions {
  readonly title: string;
  readonly type?: string;
  readonly id?: string;
  readonly route?: string;
  readonly entry?: string;
  readonly iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri };
  readonly viewColumn?: vscode.ViewColumn;
  readonly preserveFocus?: boolean;
  readonly singlePage?: boolean;
  readonly webviewPanel?: vscode.WebviewPanel;
  readonly state?: unknown;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly eventHandler?: (handler: TypedWebviewHandler) => void;
}

interface ManagedView {
  readonly key: string;
  readonly panel: vscode.WebviewPanel;
  readonly handler: TypedWebviewHandler;
  creating: boolean;
  initContent?: unknown;
  readonly disposeRegistration: vscode.Disposable;
}

function createHostWebview(panel: vscode.WebviewPanel): HostWebview {
  return {
    postMessage: (message) => panel.webview.postMessage(message),
    onDidReceiveMessage: (listener) =>
      panel.webview.onDidReceiveMessage(listener),
    onDidDispose: (listener) => panel.onDidDispose(listener),
  };
}

export class VscodeWebviewManager implements Disposable {
  private readonly views = new Map<string, ManagedView>();

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly logger: Logger,
  ) {}

  public async createWebviewPanel(
    options: ModernWebviewPanelOptions,
  ): Promise<vscode.WebviewPanel> {
    const singlePage = options.singlePage ?? true;
    const baseKey = options.type ?? options.title;
    const key = singlePage ? baseKey : `${baseKey}:${Date.now()}`;
    const existing = singlePage ? this.views.get(key) : undefined;

    if (existing) {
      const wasCreating = existing.creating;
      if (!existing.panel.visible) {
        existing.panel.reveal(
          options.viewColumn ?? vscode.ViewColumn.One,
          options.preserveFocus ?? true,
        );
      }
      existing.handler.reset();
      existing.handler.on("init", (content) => {
        existing.creating = false;
        existing.initContent = content;
      });
      options.eventHandler?.(existing.handler);
      if (!wasCreating) {
        await existing.handler.send("init", existing.initContent);
      }
      return existing.panel;
    }

    const panel =
      options.webviewPanel ??
      vscode.window.createWebviewPanel(
        key,
        options.title,
        {
          viewColumn: options.viewColumn ?? vscode.ViewColumn.One,
          preserveFocus: options.preserveFocus ?? true,
        },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      );
    if (options.iconPath) {
      panel.iconPath = options.iconPath;
    }

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "out", "webview"),
      ],
    };

    const handler = new TypedWebviewHandler(
      createHostWebview(panel),
      this.logger,
    );
    const view: ManagedView = {
      key,
      panel,
      handler,
      creating: true,
      disposeRegistration: panel.onDidDispose(() => {
        this.views.delete(key);
        handler.dispose();
      }),
    };
    this.views.set(key, view);

    handler.on("init", (content) => {
      view.creating = false;
      view.initContent = content;
    });
    options.eventHandler?.(handler);

    try {
      panel.webview.html = await renderPackagedWebviewHtml(
        this.extensionUri,
        panel.webview,
        {
          route: options.route,
          state: options.state ?? {},
          config: options.config ?? {},
        },
        options.entry,
      );
    } catch (error) {
      view.disposeRegistration.dispose();
      handler.dispose();
      this.views.delete(key);
      panel.dispose();
      throw error;
    }
    return panel;
  }

  public get(key: string): ManagedView | undefined {
    return this.views.get(key);
  }

  public reset(key?: string): void {
    if (key) {
      this.views.get(key)?.handler.reset();
      return;
    }
    for (const view of this.views.values()) {
      view.handler.reset();
    }
  }

  public dispose(): void {
    for (const view of this.views.values()) {
      view.disposeRegistration.dispose();
      view.handler.dispose();
      view.panel.dispose();
    }
    this.views.clear();
  }
}
