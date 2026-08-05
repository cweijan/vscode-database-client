import type { WebviewBridge } from "./bridge";

export interface PersistedWebviewState {
  readonly page?: string;
  readonly connectionKey?: string;
  readonly filters?: Record<string, string>;
  readonly [key: string]: unknown;
}

export class WebviewStateStore {
  private state: PersistedWebviewState;

  public constructor(private readonly bridge: WebviewBridge) {
    this.state = bridge.getState<PersistedWebviewState>() ?? {};
  }

  public get<T>(key: string, fallback: T): T {
    return (this.state[key] ?? fallback) as T;
  }

  public snapshot(): PersistedWebviewState {
    return { ...this.state };
  }

  public update<T>(key: string, value: T): void {
    this.state = { ...this.state, [key]: value };
    this.bridge.setState(this.state);
    this.bridge.emit("upState", { key, value });
  }

  public replace(state: PersistedWebviewState): void {
    this.state = { ...state };
    this.bridge.setState(this.state);
  }

  public has(key: string): boolean {
    return key in this.state;
  }
}
