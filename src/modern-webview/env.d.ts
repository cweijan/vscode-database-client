interface HostMessage {
  type?: string;
  content?: unknown;
}

interface VsCodeApi {
  getState(): unknown;
  postMessage(message: unknown): void;
  setState<T>(state: T): T;
}

interface WebviewBootstrapConfig {
  readonly route?: string;
  readonly language?: string;
  readonly appName?: string;
  readonly state?: Record<string, unknown>;
  readonly config?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

interface Window {
  acquireVsCodeApi?: () => VsCodeApi;
}
