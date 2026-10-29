import { access } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";

import type { ConnectionOptions } from "./types";

const execFileAsync = promisify(execFile);

export type MongoDumpOperation = "dump" | "restore";

export interface MongoDumpRequest {
  readonly executablePath: string;
  readonly path: string;
  readonly database?: string;
  readonly collection?: string;
}

export interface MongoDumpResult {
  readonly operation: MongoDumpOperation;
  readonly executablePath: string;
  readonly path: string;
  readonly args: readonly string[];
  readonly durationMs: number;
}

function optionValue(connection: ConnectionOptions, key: string): unknown {
  return connection.options?.[key];
}

function optionText(connection: ConnectionOptions, key: string): string {
  const value = optionValue(connection, key);
  return typeof value === "string" ? value : "";
}

function optionNumber(
  connection: ConnectionOptions,
  key: string,
  fallback: number,
): number {
  const value = optionValue(connection, key);
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function useConnectionString(connection: ConnectionOptions): boolean {
  const configured = optionValue(connection, "useConnectionString");
  if (typeof configured === "boolean") return configured;
  return Boolean(connection.connectionUrl);
}

function mongoConnectionArguments(connection: ConnectionOptions): string[] {
  if (useConnectionString(connection) && connection.connectionUrl?.trim()) {
    return [connection.connectionUrl.trim()];
  }
  const args = [
    "--host",
    connection.host || optionText(connection, "host") || "localhost",
    "--port",
    String(connection.port || optionNumber(connection, "port", 27017)),
  ];
  const user = connection.user || optionText(connection, "user");
  const password = connection.password || optionText(connection, "password");
  if (user) args.push("--username", user);
  if (password) args.push("--password", password);
  return args;
}

export function defaultMongoExecutable(
  operation: MongoDumpOperation,
): string {
  return operation === "dump" ? "mongodump" : "mongorestore";
}

export function mongoExecutableCandidates(
  operation: MongoDumpOperation,
): readonly string[] {
  return [defaultMongoExecutable(operation)];
}

export function buildMongoDumpArguments(
  connection: ConnectionOptions,
  operation: MongoDumpOperation,
  request: Pick<MongoDumpRequest, "path" | "database" | "collection">,
): readonly string[] {
  const targetPath = request.path.trim();
  if (!targetPath) throw new Error("MongoDB dump path is required");

  const args = mongoConnectionArguments(connection);
  if (operation === "dump") {
    const database = request.database?.trim() || connection.database?.trim();
    if (database) args.push("--db", database);
    if (request.collection?.trim()) args.push("--collection", request.collection.trim());
    args.push("--out", targetPath);
  } else {
    args.push(targetPath);
  }
  return args;
}

async function locateExecutable(candidate: string): Promise<string | undefined> {
  const value = candidate.trim();
  if (!value) return undefined;
  if (path.isAbsolute(value) || value.includes("/") || value.includes("\\")) {
    try {
      await access(value);
      return value;
    } catch {
      return undefined;
    }
  }
  const locator = process.platform === "win32" ? "where" : "which";
  try {
    const result = await execFileAsync(locator, [value], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return String(result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
}

function collectOutput(child: ReturnType<typeof spawn>): Promise<number> {
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer | string) => {
    if (stderr.length < 2 * 1024 * 1024) stderr += String(chunk);
  });
  child.stdout?.resume();
  return new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(0);
        return;
      }
      reject(new Error(stderr.trim() || `MongoDB dump tool exited with code ${code ?? -1}`));
    });
  });
}

function redactArguments(args: readonly string[]): readonly string[] {
  return args.map((argument, index) => {
    if (args[index - 1] === "--password") return "<redacted>";
    return argument.replace(
      /^(mongodb(?:\+srv)?:\/\/[^:/@]+:)[^@]+@/i,
      "$1<redacted>@",
    );
  });
}

export class MongoDumpService {
  public async findExecutable(
    operation: MongoDumpOperation,
    requested?: string,
  ): Promise<string | undefined> {
    const candidates = requested?.trim()
      ? [requested]
      : mongoExecutableCandidates(operation);
    for (const candidate of candidates) {
      const located = await locateExecutable(candidate);
      if (located) return located;
    }
    return undefined;
  }

  public async run(
    connection: ConnectionOptions,
    operation: MongoDumpOperation,
    request: MongoDumpRequest,
  ): Promise<MongoDumpResult> {
    if (connection.type !== "MongoDB") {
      throw new Error(`MongoDB dump is not supported for ${connection.type}`);
    }
    const executablePath = request.executablePath.trim();
    if (!executablePath) throw new Error("MongoDB dump executable is required");
    const targetPath = request.path.trim();
    if (!targetPath) throw new Error("MongoDB dump path is required");
    try {
      await execFileAsync(executablePath, ["--version"], {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      throw new Error(
        `MongoDB dump executable is not available: ${executablePath}. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const args = buildMongoDumpArguments(connection, operation, request);
    const started = Date.now();
    const child = spawn(executablePath, [...args], {
      env: { ...process.env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await collectOutput(child);
    return {
      operation,
      executablePath,
      path: targetPath,
      args: redactArguments(args),
      durationMs: Date.now() - started,
    };
  }
}
