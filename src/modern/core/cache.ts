import { readdir, rm } from "node:fs/promises";
import * as path from "node:path";

import type { Disposable } from "./contracts";

export class CacheService implements Disposable {
  private readonly clearers = new Set<() => void>();

  public constructor(
    private readonly rootPath?: string,
    private readonly connectionIds: () => ReadonlySet<string> = () => new Set(),
  ) {}

  public register(clearer: () => void): Disposable {
    this.clearers.add(clearer);
    return {
      dispose: () => this.clearers.delete(clearer),
    };
  }

  public async clear(): Promise<void> {
    for (const clearer of this.clearers) clearer();
    if (!this.rootPath) return;
    const ids = this.connectionIds();
    await Promise.all([
      this.clearRootDirectory(path.join(this.rootPath, "storage"), ids),
      this.clearRootDirectory(path.join(this.rootPath, "query"), ids),
    ]);
    await this.removeMockFiles(path.join(this.rootPath, "storage"));
  }

  public dispose(): void {
    this.clearers.clear();
  }

  private async clearRootDirectory(
    directory: string,
    ids: ReadonlySet<string>,
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const retained = [...ids].some((id) =>
          entry.name === id
          || entry.name.startsWith(`${id}@`)
          || entry.name.startsWith(`${id}__`),
        );
        if (!retained) await rm(entryPath, { recursive: true, force: true });
        continue;
      }
      if (entry.name !== "history.sql" && entry.name !== "notebook.sqlbook") {
        await rm(entryPath, { force: true });
      }
    }
  }

  private async removeMockFiles(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.removeMockFiles(entryPath);
      } else if (entry.name.endsWith("-mock.json")) {
        await rm(entryPath, { force: true });
      }
    }
  }
}
