export interface Disposable {
  dispose(): void;
}

export interface ConfigurationReader {
  get<T>(key: string, fallback: T): T;
}

export interface StateStore {
  get<T>(key: string, fallback: T): T;
  update<T>(key: string, value: T): Promise<void>;
  keys(): readonly string[];
}

export interface ResourceResolver {
  resolve(...segments: string[]): string;
}

export interface Logger {
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, error?: unknown): void;
}
