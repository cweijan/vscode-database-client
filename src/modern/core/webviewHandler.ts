import type { Disposable, Logger } from "./contracts";

export interface HostWebview {
  postMessage(message: { type: string; content?: unknown }): Thenable<boolean> | Promise<boolean>;
  onDidReceiveMessage(listener: (message: WebviewMessage) => void): Disposable;
  onDidDispose(listener: () => void): Disposable;
}

export interface WebviewMessage {
  readonly type: string;
  readonly content?: unknown;
}

type MessageHandler = (content: unknown, message: WebviewMessage) => void | Promise<void>;

export class TypedWebviewHandler implements Disposable {
  private readonly handlers = new Map<string, Set<MessageHandler>>();
  private disposed = false;
  private state: unknown;
  private readonly messageRegistration: Disposable;
  private readonly disposeRegistration: Disposable;

  public constructor(
    private readonly webview: HostWebview,
    private readonly logger: Logger,
  ) {
    this.messageRegistration = webview.onDidReceiveMessage((message) => {
      void this.dispatch(message);
    });
    this.disposeRegistration = webview.onDidDispose(() => this.dispose());
  }

  public on(type: string, handler: MessageHandler): Disposable {
    const handlers = this.handlers.get(type) ?? new Set<MessageHandler>();
    handlers.add(handler);
    this.handlers.set(type, handlers);
    return {
      dispose: () => {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(type);
        }
      },
    };
  }

  public onInit(viewType: string | undefined, handler: MessageHandler): Disposable {
    return this.on("init", (content, message) => {
      const initType =
        content && typeof content === "object"
          ? (content as { type?: unknown }).type
          : undefined;
      if (!viewType || initType === viewType) {
        return handler(content, message);
      }
    });
  }

  public async send(type: string, content?: unknown): Promise<boolean> {
    if (this.disposed) {
      return false;
    }
    return Promise.resolve(this.webview.postMessage({ type, content }));
  }

  public saveState(state: unknown): void {
    this.state = state;
  }

  public getState<T>(): T | undefined {
    return this.state as T | undefined;
  }

  public async setWebviewState(state: unknown): Promise<boolean> {
    this.saveState(state);
    return this.send("setState", state);
  }

  public reset(): void {
    this.handlers.clear();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.messageRegistration.dispose();
    this.disposeRegistration.dispose();
    this.handlers.clear();
  }

  private async dispatch(message: WebviewMessage): Promise<void> {
    if (this.disposed || !message || typeof message.type !== "string") {
      return;
    }
    for (const handler of this.handlers.get(message.type) ?? []) {
      try {
        await handler(message.content, message);
      } catch (error) {
        this.logger.error("Webview message handler failed: " + message.type, error);
      }
    }
  }
}
