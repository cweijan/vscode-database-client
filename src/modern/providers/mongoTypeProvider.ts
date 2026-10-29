import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

export interface MongoTypeInfo {
  readonly name: string;
  readonly line: number;
  readonly column: number;
  readonly jsDoc: string;
  readonly trimJSDoc: string;
}

function typeFileCandidates(): readonly string[] {
  return [
    path.join(__dirname, "types", "mongodb.d.ts"),
    path.resolve(process.cwd(), "out", "types", "mongodb.d.ts"),
    path.resolve(__dirname, "..", "..", "..", "out", "types", "mongodb.d.ts"),
  ];
}

function typeFilePath(): string {
  const candidates = typeFileCandidates();
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

function firstDocumentationLine(documentation: string): string {
  const lines = documentation
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\/\*+\s?/, "").replace(/^\s*\*\s?/, "").trim())
    .filter((line) => line && line !== "/");
  return lines[0] || "MongoDB method";
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class MongoTypeProvider {
  public readonly documentPath: string;
  private readonly lines: readonly string[];
  private readonly cache = new Map<string, MongoTypeInfo | undefined>();

  public constructor(documentPath = typeFilePath()) {
    this.documentPath = documentPath;
    this.lines = existsSync(documentPath)
      ? readFileSync(documentPath, "utf8").split(/\r?\n/)
      : [];
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public findByName(name: string): MongoTypeInfo | undefined {
    const cached = this.cache.get(name);
    if (cached !== undefined || this.cache.has(name)) return cached;
    const declaration = new RegExp(`^\\s{4}${escaped(name)}(?:\\(|<)`);
    const index = this.lines.findIndex((line) => declaration.test(line));
    if (index < 0) {
      this.cache.set(name, undefined);
      return undefined;
    }
    const jsDocLines: string[] = [];
    for (let line = index - 1; line >= 0; line -= 1) {
      jsDocLines.unshift(this.lines[line] || "");
      if ((this.lines[line] || "").trim().startsWith("/**")) break;
    }
    const jsDoc = jsDocLines.join("\n");
    const info: MongoTypeInfo = {
      name,
      line: index,
      column: this.lines[index]?.indexOf(name) ?? 0,
      jsDoc,
      trimJSDoc: firstDocumentationLine(jsDoc),
    };
    this.cache.set(name, info);
    return info;
  }
}
