import type { ConnectionOptions } from "../database/types";

export class ActiveConnectionStore {
  private current?: ConnectionOptions;

  public get(): ConnectionOptions | undefined {
    return this.current;
  }

  public set(options: ConnectionOptions): void {
    this.current = options;
  }

  public clear(): void {
    this.current = undefined;
  }
}
