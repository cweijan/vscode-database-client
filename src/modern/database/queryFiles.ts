import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";

import type { ConnectionOptions } from "./types";

export type QueryFileExtension = "sql" | "sqlbook" | "es" | "dbclient-js";

export interface QueryFileEntry {
  readonly name: string;
  readonly filePath: string;
  readonly extension: QueryFileExtension;
  readonly directory: string;
}

export interface QueryDirectoryEntry {
  readonly kind: "directory";
  readonly name: string;
  readonly directory: string;
}

export type QueryTreeEntry = QueryFileEntry | QueryDirectoryEntry;

const supportedExtensions = new Set<QueryFileExtension>([
  "sql",
  "sqlbook",
  "es",
  "dbclient-js",
]);

function safeSegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\.+$/g, "")
    .trim();
  return normalized || fallback;
}

export function queryScopeKey(connection: ConnectionOptions): string {
  return [connection.id, connection.database || "", connection.schema || ""]
    .map((value) => safeSegment(value, "default"))
    .join("__");
}

export function queryName(value: string): string {
  const normalized = safeSegment(value.replace(/\.(sql|sqlbook|es|dbclient-js)$/i, ""), "");
  if (!normalized) throw new Error("Query name is required");
  return normalized;
}

function extensionOf(filePath: string): QueryFileExtension | undefined {
  const extension = path.extname(filePath).slice(1).toLowerCase() as QueryFileExtension;
  return supportedExtensions.has(extension) ? extension : undefined;
}

export class QueryFileService {
  public constructor(private readonly rootPath: string) {}

  public defaultDirectory(connection: ConnectionOptions): string {
    return path.join(this.rootPath, "query", queryScopeKey(connection));
  }

  public isQueryFile(filePath: string): boolean {
    return extensionOf(filePath) !== undefined;
  }

  public async list(directory: string): Promise<QueryFileEntry[]> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const extension = extensionOf(entry.name);
        if (!extension) return undefined;
        return {
          name: entry.name.slice(0, -(extension.length + 1)),
          filePath: path.join(directory, entry.name),
          extension,
          directory,
        } satisfies QueryFileEntry;
      })
      .filter((entry): entry is QueryFileEntry => entry !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  }

  public async listTree(directory: string): Promise<QueryTreeEntry[]> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry): QueryTreeEntry | undefined => {
        if (entry.isDirectory()) {
          return {
            kind: "directory",
            name: entry.name,
            directory: path.join(directory, entry.name),
          };
        }
        if (!entry.isFile()) return undefined;
        const extension = extensionOf(entry.name);
        if (!extension) return undefined;
        return {
          name: entry.name.slice(0, -(extension.length + 1)),
          filePath: path.join(directory, entry.name),
          extension,
          directory,
        } satisfies QueryFileEntry;
      })
      .filter((entry): entry is QueryTreeEntry => entry !== undefined)
      .sort((left, right) => {
        const leftDirectory = "kind" in left;
        const rightDirectory = "kind" in right;
        if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1;
        return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      });
  }

  public async isDirectory(directory: string): Promise<boolean> {
    return (await stat(directory).catch(() => undefined))?.isDirectory() === true;
  }

  public async create(
    directory: string,
    name: string,
    extension: QueryFileExtension,
    content = "",
  ): Promise<string> {
    const normalizedName = queryName(name);
    await mkdir(directory, { recursive: true });
    const filePath = path.join(directory, `${normalizedName}.${extension}`);
    await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
    return filePath;
  }

  public async read(filePath: string): Promise<string> {
    this.assertQueryFile(filePath);
    return readFile(filePath, "utf8");
  }

  public async rename(filePath: string, name: string): Promise<string> {
    const extension = this.assertQueryFile(filePath);
    const nextPath = path.join(path.dirname(filePath), `${queryName(name)}.${extension}`);
    if (path.resolve(nextPath) === path.resolve(filePath)) return filePath;
    await rename(filePath, nextPath);
    return nextPath;
  }

  public async remove(filePath: string): Promise<void> {
    this.assertQueryFile(filePath);
    await rm(filePath, { force: true });
  }

  private assertQueryFile(filePath: string): QueryFileExtension {
    const extension = extensionOf(filePath);
    if (!extension) throw new Error("Only supported query files can be changed");
    return extension;
  }
}
