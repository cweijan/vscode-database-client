import type { InjectionKey } from "vue";

export interface WebviewMessage {
  readonly type: string;
  readonly content?: unknown;
}

export interface VsCodeApiLike {
  getState(): unknown;
  postMessage(message: WebviewMessage): void;
  setState<T>(state: T): T;
}

export interface BridgeDisposable {
  dispose(): void;
}

type MessageHandler = (content: unknown, message: WebviewMessage) => void;
type MessageTarget = Pick<Window, "addEventListener" | "removeEventListener">;

export class WebviewBridge {
  private readonly handlers = new Map<string, Set<MessageHandler>>();
  private readonly anyHandlers = new Set<MessageHandler>();
  private listening = false;

  private readonly onMessage = (event: MessageEvent<WebviewMessage>): void => {
    const message = event.data;
    if (!message || typeof message.type !== "string") {
      return;
    }
    for (const handler of this.handlers.get(message.type) ?? []) {
      handler(message.content, message);
    }
    for (const handler of this.anyHandlers) {
      handler(message.content, message);
    }
  };

  public constructor(
    private readonly api: VsCodeApiLike | undefined,
    private readonly target: MessageTarget,
  ) {}

  public start(): void {
    if (this.listening) {
      return;
    }
    this.listening = true;
    this.target.addEventListener("message", this.onMessage);
  }

  public on(type: string, handler: MessageHandler): BridgeDisposable {
    this.start();
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

  public onAny(handler: MessageHandler): BridgeDisposable {
    this.start();
    this.anyHandlers.add(handler);
    return {
      dispose: () => this.anyHandlers.delete(handler),
    };
  }

  public emit(type: string, content?: unknown): void {
    this.api?.postMessage({ type, content });
  }

  public init(viewType: string): void {
    this.emit("init", { type: viewType });
  }

  public getState<T>(): T | undefined {
    return this.api?.getState() as T | undefined;
  }

  public setState<T>(state: T): T | undefined {
    return this.api?.setState(state);
  }

  public dispose(): void {
    if (this.listening) {
      this.target.removeEventListener("message", this.onMessage);
      this.listening = false;
    }
    this.handlers.clear();
    this.anyHandlers.clear();
  }
}

export const WEBVIEW_BRIDGE_KEY: InjectionKey<WebviewBridge> = Symbol(
  "database-client.webview-bridge",
);

export function createWebviewBridge(
  api: VsCodeApiLike | undefined = window.acquireVsCodeApi?.(),
): WebviewBridge {
  return new WebviewBridge(api, window);
}
