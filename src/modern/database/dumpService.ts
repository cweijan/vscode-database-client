import { createWriteStream } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";

import type { DatabaseType, ConnectionOptions } from "./types";
import { connectionOption } from "./connectionOptions";
import { isMysql, isPostgres } from "./statusService";

const execFileAsync = promisify(execFile);

export type DumpKind = "mysql" | "postgresql";

export interface MysqlDumpConfig {
  readonly kind: "mysql";
  readonly executablePath: string;
  readonly outputPath: string;
  readonly databases: string;
  readonly tables: string;
  readonly addDropTable: boolean;
  readonly disableKeys: boolean;
  readonly addLocks: boolean;
  readonly addDropTrigger: boolean;
  readonly noData: boolean;
  readonly completeInsert: boolean;
  readonly createOptions: boolean;
  readonly routines: boolean;
  readonly lockAllTables: boolean;
}

export interface PostgresDumpConfig {
  readonly kind: "postgresql";
  readonly executablePath: string;
  readonly outputPath: string;
  readonly statements: "copy" | "insert" | "column-insert";
  readonly databases: string;
  readonly schemas: string;
  readonly tables: string;
  readonly format: "file" | "custom" | "directory" | "tar";
  readonly addDrop: boolean;
  readonly useDropIfExists: boolean;
  readonly createDatabase: boolean;
  readonly schemaOnly: boolean;
  readonly dataOnly: boolean;
}

export type DumpConfig = MysqlDumpConfig | PostgresDumpConfig;

export type DumpInitialization = DumpConfig & {
  readonly title: string;
  readonly platform: NodeJS.Platform;
  readonly executableCandidates: readonly string[];
};

export interface DumpRunResult {
  readonly kind: DumpKind;
  readonly executablePath: string;
  readonly outputPath: string;
  readonly args: readonly string[];
  readonly durationMs: number;
}

function optionValue(connection: ConnectionOptions, key: string): unknown {
  return connectionOption(connection, key);
}

function optionText(connection: ConnectionOptions, key: string, fallback = ""): string {
  const value = optionValue(connection, key);
  return typeof value === "string" ? value : fallback;
}

function optionNumber(connection: ConnectionOptions, key: string, fallback: number): number {
  const value = optionValue(connection, key);
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function optionBoolean(connection: ConnectionOptions, key: string, fallback = false): boolean {
  const value = optionValue(connection, key);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  return fallback;
}

function connectionHost(connection: ConnectionOptions): string {
  return connection.host || optionText(connection, "host", "localhost");
}

function connectionPort(connection: ConnectionOptions, kind: DumpKind): string {
  const fallback = kind === "postgresql" ? 5432 : 3306;
  return String(connection.port || optionNumber(connection, "port", fallback));
}

function connectionUser(connection: ConnectionOptions): string {
  return connection.user || optionText(connection, "user");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Keep the target extension's local-time dump filename format. */
export function formatDumpTimestamp(date: Date): string {
  const hour = date.getHours() % 12 || 12;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(hour)}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function resolveDumpOutputPath(
  template: string,
  connection: ConnectionOptions,
  date = new Date(),
  home = os.homedir(),
): string {
  const source = connection.name || optionText(connection, "label") || connection.host || "dump";
  const database = connection.database || "";
  const resolved = template
    .replaceAll("{timestamp}", formatDumpTimestamp(date))
    .replaceAll("{data_source}", source)
    .replaceAll("{database}", database);
  return path.isAbsolute(resolved) ? resolved : path.join(home, resolved);
}

function executableName(type: DatabaseType): string {
  if (type === "MariaDB") return "mariadb-dump";
  if (isPostgres(type)) return "pg_dump";
  return "mysqldump";
}

export function defaultDumpExecutable(
  type: DatabaseType,
  platform: NodeJS.Platform = process.platform,
): string {
  const name = executableName(type);
  if (platform === "win32") return name;
  if (platform === "darwin") return path.join("/usr/local/bin", name);
  return path.join("/usr/bin", name);
}

export function dumpExecutableCandidates(
  type: DatabaseType,
  platform: NodeJS.Platform = process.platform,
): readonly string[] {
  const name = executableName(type);
  const candidates = [defaultDumpExecutable(type, platform), name];
  if (type === "MariaDB") candidates.push("mysqldump");
  return [...new Set(candidates)];
}

export function dumpKind(type: DatabaseType): DumpKind | undefined {
  if (isMysql(type)) return "mysql";
  if (isPostgres(type)) return "postgresql";
  return undefined;
}

export function isDumpSupported(type: DatabaseType): boolean {
  return dumpKind(type) !== undefined;
}

export function createMysqlDumpConfig(
  connection: ConnectionOptions,
  executablePath = defaultDumpExecutable(connection.type),
): MysqlDumpConfig {
  return {
    kind: "mysql",
    executablePath,
    outputPath: path.join(os.homedir(), "Downloads", "{data_source}-{timestamp}-dump.sql"),
    databases: connection.database || "",
    tables: "",
    addDropTable: true,
    disableKeys: true,
    addLocks: true,
    addDropTrigger: false,
    noData: false,
    completeInsert: false,
    createOptions: true,
    routines: false,
    lockAllTables: true,
  };
}

export function createPostgresDumpConfig(
  connection: ConnectionOptions,
  executablePath = defaultDumpExecutable(connection.type),
): PostgresDumpConfig {
  return {
    kind: "postgresql",
    executablePath,
    outputPath: path.join(os.homedir(), "Downloads", "{data_source}-{timestamp}-dump.sql"),
    statements: "copy",
    databases: connection.database || "postgres",
    schemas: connection.schema || "public",
    tables: "",
    format: "file",
    addDrop: false,
    useDropIfExists: false,
    createDatabase: false,
    schemaOnly: false,
    dataOnly: false,
  };
}

function mysqlVersionFlag(version: string, executablePath: string): boolean {
  return version.includes("8.") || version.includes("5.7") || executablePath.includes(".dbclient");
}

export function buildMysqlDumpArguments(
  connection: ConnectionOptions,
  config: MysqlDumpConfig,
  version = "",
): readonly string[] {
  const args: string[] = [
    "-h", connectionHost(connection),
    "-P", connectionPort(connection, "mysql"),
    "-u", connectionUser(connection),
  ];
  const useSsl = optionBoolean(connection, "useSSL");
  const mariaDb = connection.type === "MariaDB" || version.includes("MariaDB");
  if (!useSsl && mariaDb) args.push("--skip-ssl");
  if (mysqlVersionFlag(version, config.executablePath)) {
    args.push(`--ssl-mode=${useSsl ? "REQUIRED" : "DISABLED"}`);
  }
  if (useSsl) {
    const sslOptions: Array<[string, string]> = [
      ["--ssl-ca", optionText(connection, "caPath")],
      ["--ssl-cert", optionText(connection, "clientCertPath")],
      ["--ssl-key", optionText(connection, "clientKeyPath")],
    ];
    for (const [flag, value] of sslOptions) if (value) args.push(`${flag}=${value}`);
  }
  const socketPath = connection.socketPath || optionText(connection, "socketPath");
  if (socketPath && !optionBoolean(connection, "usingSSH")) {
    args.push("--protocol=socket", "-S", socketPath);
  }
  args.push("--hex-blob");
  if (config.addDropTable) args.push("--add-drop-table");
  if (config.disableKeys) args.push("--disable-keys");
  args.push(config.addLocks ? "--add-locks" : "--skip-add-locks");
  if (config.addDropTrigger) args.push("--add-drop-trigger");
  if (config.noData) args.push("--no-data");
  if (config.completeInsert) args.push("--complete-insert");
  args.push(config.createOptions ? "--create-options" : "--skip-create-options");
  if (config.routines) args.push("--routines");
  args.push(config.lockAllTables ? "--lock-all-tables" : "--skip-lock-tables");
  if (mysqlVersionFlag(version, config.executablePath)) args.push("--column-statistics=0");
  const database = config.databases.trim() || connection.database || "";
  if (database) args.push(database);
  args.push(...config.tables.trim().split(/\s+/).filter(Boolean));
  return args;
}

function quotePostgresIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildPostgresDumpArguments(
  connection: ConnectionOptions,
  config: PostgresDumpConfig,
  outputPath = config.outputPath,
): readonly string[] {
  const args: string[] = [
    "-h", connectionHost(connection),
    "-w",
    "-p", connectionPort(connection, "postgresql"),
    "-U", connectionUser(connection),
  ];
  if (config.format === "custom") args.push("-F", "c");
  else if (config.format === "directory") args.push("-F", "d");
  else if (config.format === "tar") args.push("-F", "t");
  else args.push("-F", "p");
  if (config.statements === "insert") args.push("--inserts");
  if (config.statements === "column-insert") args.push("--column-inserts");
  if (config.addDrop) args.push("--clean");
  if (config.useDropIfExists) args.push("--if-exists");
  if (config.createDatabase) args.push("--create");
  if (config.schemaOnly) args.push("--schema-only");
  if (config.dataOnly) args.push("--data-only");
  const schemas = config.schemas.trim().split(/\s+/).filter(Boolean);
  for (const schema of schemas) args.push("-n", schema);
  const tableSchema = schemas[0] || connection.schema || "public";
  for (const table of config.tables.trim().split(/\s+/).filter(Boolean)) {
    args.push("-t", `${quotePostgresIdentifier(tableSchema)}.${quotePostgresIdentifier(table)}`);
  }
  const database = config.databases.trim() || connection.database || "";
  if (database) args.push(database);
  if (outputPath) args.push("-f", outputPath);
  return args;
}

export function normalizeDumpConfig(
  connection: ConnectionOptions,
  value: unknown,
): DumpConfig {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const kind = dumpKind(connection.type);
  if (!kind) throw new Error(`Dump is not supported for ${connection.type}`);
  const text = (key: string, fallback = ""): string => {
    const candidate = source[key];
    return typeof candidate === "string" ? candidate : fallback;
  };
  const flag = (key: string, fallback: boolean): boolean => {
    const candidate = source[key];
    return typeof candidate === "boolean" ? candidate : fallback;
  };
  if (kind === "mysql") {
    const defaults = createMysqlDumpConfig(connection, text("executablePath", defaultDumpExecutable(connection.type)));
    return {
      ...defaults,
      outputPath: text("outputPath", defaults.outputPath),
      databases: text("databases", defaults.databases),
      tables: text("tables"),
      addDropTable: flag("addDropTable", defaults.addDropTable),
      disableKeys: flag("disableKeys", defaults.disableKeys),
      addLocks: flag("addLocks", defaults.addLocks),
      addDropTrigger: flag("addDropTrigger", defaults.addDropTrigger),
      noData: flag("noData", defaults.noData),
      completeInsert: flag("completeInsert", defaults.completeInsert),
      createOptions: flag("createOptions", defaults.createOptions),
      routines: flag("routines", defaults.routines),
      lockAllTables: flag("lockAllTables", defaults.lockAllTables),
    };
  }
  const defaults = createPostgresDumpConfig(connection, text("executablePath", defaultDumpExecutable(connection.type)));
  const statements = text("statements", defaults.statements);
  const format = text("format", defaults.format);
  return {
    ...defaults,
    outputPath: text("outputPath", defaults.outputPath),
    statements: statements === "insert" || statements === "column-insert" ? statements : "copy",
    databases: text("databases", defaults.databases),
    schemas: text("schemas", defaults.schemas),
    tables: text("tables"),
    format: format === "custom" || format === "directory" || format === "tar" ? format : "file",
    addDrop: flag("addDrop", defaults.addDrop),
    useDropIfExists: flag("useDropIfExists", defaults.useDropIfExists),
    createDatabase: flag("createDatabase", defaults.createDatabase),
    schemaOnly: flag("schemaOnly", defaults.schemaOnly),
    dataOnly: flag("dataOnly", defaults.dataOnly),
  };
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
    return String(result.stdout || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  } catch {
    return undefined;
  }
}

function dumpEnvironment(connection: ConnectionOptions): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  const password = connection.password || optionText(connection, "password");
  if (isPostgres(connection.type)) {
    delete environment.PGPASSWORD;
    if (password) environment.PGPASSWORD = password;
  } else {
    delete environment.MYSQL_PWD;
    if (password) environment.MYSQL_PWD = password;
  }
  return environment;
}

async function runDumpProcess(
  executablePath: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  outputPath: string,
  writeStdout: boolean,
): Promise<void> {
  const child = spawn(executablePath, [...args], {
    env: environment,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer | string) => {
    if (stderr.length < 2 * 1024 * 1024) stderr += String(chunk);
  });
  const stdoutDone = writeStdout
    ? pipeline(child.stdout!, createWriteStream(outputPath))
    : Promise.resolve().then(() => child.stdout?.resume());
  const processDone = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? -1));
  });
  try {
    const [code] = await Promise.all([processDone, stdoutDone]);
    if (code !== 0) {
      throw new Error(stderr.trim() || `${path.basename(executablePath)} exited with code ${code}`);
    }
  } catch (error) {
    void stdoutDone.catch(() => undefined);
    throw error;
  }
}

export class DumpService {
  public async initialize(connection: ConnectionOptions): Promise<DumpInitialization> {
    const kind = dumpKind(connection.type);
    if (!kind) throw new Error(`Dump is not supported for ${connection.type}`);
    const executable = await this.findExecutable(connection);
    const fallback = defaultDumpExecutable(connection.type);
    const config = kind === "mysql"
      ? createMysqlDumpConfig(connection, executable || fallback)
      : createPostgresDumpConfig(connection, executable || fallback);
    return {
      ...config,
      title: kind === "mysql" ? "Dump with mysqldump" : "Dump with pg_dump",
      platform: process.platform,
      executableCandidates: dumpExecutableCandidates(connection.type),
    };
  }

  public async findExecutable(
    connection: ConnectionOptions,
    requested?: string,
  ): Promise<string | undefined> {
    const candidates = requested?.trim()
      ? [requested]
      : dumpExecutableCandidates(connection.type);
    for (const candidate of candidates) {
      const located = await locateExecutable(candidate);
      if (located) return located;
    }
    return undefined;
  }

  public async run(
    connection: ConnectionOptions,
    rawConfig: DumpConfig,
  ): Promise<DumpRunResult> {
    const config = normalizeDumpConfig(connection, rawConfig);
    if (!config.executablePath.trim()) throw new Error("Dump executable path is required");
    if (!config.outputPath.trim()) throw new Error("Dump output path is required");
    if (!config.databases.trim()) throw new Error("Dump database is required");
    const outputPath = resolveDumpOutputPath(config.outputPath, connection);
    await mkdir(path.dirname(outputPath), { recursive: true });
    try {
      await execFileAsync(config.executablePath, ["--version"], {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      throw new Error(`Dump executable is not available: ${config.executablePath}. ${error instanceof Error ? error.message : String(error)}`);
    }
    const args = config.kind === "mysql"
      ? buildMysqlDumpArguments(connection, config)
      : buildPostgresDumpArguments(connection, config, outputPath);
    const started = Date.now();
    await runDumpProcess(
      config.executablePath,
      args,
      dumpEnvironment(connection),
      outputPath,
      config.kind === "mysql",
    );
    return {
      kind: config.kind,
      executablePath: config.executablePath,
      outputPath,
      args,
      durationMs: Date.now() - started,
    };
  }
}
