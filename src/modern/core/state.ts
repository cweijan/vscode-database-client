import type { StateStore } from "./contracts";

export class MemoryStateStore implements StateStore {
  private readonly values = new Map<string, unknown>();

  public constructor(initial: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.values.set(key, value);
    }
  }

  public get<T>(key: string, fallback: T): T {
    return (this.values.has(key) ? this.values.get(key) : fallback) as T;
  }

  public async update<T>(key: string, value: T): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
  }

  public keys(): readonly string[] {
    return [...this.values.keys()];
  }
}

export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
  keys(): readonly string[];
}

export class MementoStateStore implements StateStore {
  public constructor(private readonly memento: MementoLike) {}

  public get<T>(key: string, fallback: T): T {
    return this.memento.get<T>(key) ?? fallback;
  }

  public update<T>(key: string, value: T): Promise<void> {
    return Promise.resolve(this.memento.update(key, value));
  }

  public keys(): readonly string[] {
    return this.memento.keys();
  }
}
