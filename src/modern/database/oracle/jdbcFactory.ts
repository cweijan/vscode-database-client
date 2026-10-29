import axios from "axios";
import { promises as fs } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

import { OperationCancelledError } from "../../core/errors";
import {
  DriverConnectionFactory,
  type DriverConnection,
  type DriverConnector,
} from "../driverConnectionFactory";
import type {
  ConnectionOptions,
  DatabaseType,
  QueryOptions,
} from "../types";
import { connectionOption, connectionNamespace } from "../connectionOptions";

const JDBC_HOST = "127.0.0.1";
const JDBC_PORT = 7823;
const JDBC_BASE_URL = `http://${JDBC_HOST}:${JDBC_PORT}`;
const JDBC_MANAGED_DIRECTORY = path.join(os.homedir(), ".dbclient");
const JDBC_MANAGED_JAR = path.join(JDBC_MANAGED_DIRECTORY, "jdbc-adapter-server.jar");

interface OracleJdbcConfig {
  readonly id: string;
  readonly jdbcUrl: string;
  readonly driver: string;
  readonly database?: string;
  readonly username?: string;
  readonly password?: string;
  readonly dialect: "Oracle";
  readonly aliveSQL: string;
  readonly supportForward: true;
  readonly enablePagination: true;
  readonly requestTimeout?: number;
  readonly readonly?: boolean;
  readonly driverPath?: string;
  readonly properties?: Record<string, unknown>;
}

interface JdbcConnectResponse {
  readonly success?: boolean;
  readonly err?: string;
  readonly fullErr?: string;
}

interface JdbcExecuteResponse {
  readonly rows?: unknown[];
  readonly columns?: unknown[];
  readonly affectedRows?: unknown;
  readonly err?: string;
}

interface JdbcAliveResponse {
  readonly alive?: boolean;
}

interface JdbcServerState {
  process?: ChildProcessWithoutNullStreams;
  starting?: Promise<void>;
}

const serverState: JdbcServerState = {};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function option(options: ConnectionOptions, key: string): unknown {
  return connectionOption(options, key);
}

function oracleJdbcUrl(options: ConnectionOptions): string {
  const configuredUrl = text(options.connectionUrl);
  if (option(options, "useConnectionString") === true && configuredUrl) {
    return configuredUrl;
  }
  const host = text(options.host) || "localhost";
  const port = positiveNumber(options.port) || 1521;
  const database = text(options.database);
  const service = database ? `/${database}` : "";
  return `jdbc:oracle:thin:@tcp://${host}:${port}${service}?useUnicode=true&characterEncoding=utf8`;
}

export function buildOracleJdbcConfig(options: ConnectionOptions): OracleJdbcConfig {
  const jdbcOptions = connectionNamespace(options, "jdbc");
  const properties = record(jdbcOptions.properties ?? option(options, "jdbcProperties"));
  const driverPath = text(jdbcOptions.driverPath ?? option(options, "driverPath"));
  const requestTimeout = positiveNumber(option(options, "requestTimeout"));
  return {
    id: options.id,
    jdbcUrl: oracleJdbcUrl(options),
    driver: "oracle.jdbc.driver.OracleDriver",
    database: text(options.database),
    username: text(options.user),
    password: options.password,
    dialect: "Oracle",
    aliveSQL: "SELECT 1 FROM DUAL",
    supportForward: true,
    enablePagination: true,
    requestTimeout,
    readonly: option(options, "readonly") === true ? true : undefined,
    driverPath,
    properties: Object.keys(properties).length > 0 ? properties : undefined,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function portIsOpen(signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const socket = net.createConnection({ host: JDBC_HOST, port: JDBC_PORT });
    const finish = (open: boolean): void => {
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(250, () => finish(false));
  });
}

async function resolveJdbcJar(): Promise<string> {
  const vscode = await import("vscode");
  const extension = vscode.extensions.getExtension<{ readonly extensionPath: string }>(
    "cweijan.dbclient-jdbc",
  );
  if (!extension) {
    throw new Error(
      "Oracle connections require the cweijan.dbclient-jdbc extension pack.",
    );
  }
  const files = await fs.readdir(extension.extensionPath);
  const sourceName = files.find((file) => file.endsWith(".jar") && !file.includes(".bak"));
  if (!sourceName) {
    throw new Error("The cweijan.dbclient-jdbc extension does not contain its adapter jar.");
  }
  const sourcePath = path.join(extension.extensionPath, sourceName);
  await fs.mkdir(JDBC_MANAGED_DIRECTORY, { recursive: true });
  let shouldCopy = true;
  try {
    const [source, target] = await Promise.all([fs.stat(sourcePath), fs.stat(JDBC_MANAGED_JAR)]);
    shouldCopy = source.size !== target.size;
  } catch {
    shouldCopy = true;
  }
  if (shouldCopy) await fs.copyFile(sourcePath, JDBC_MANAGED_JAR);
  return JDBC_MANAGED_JAR;
}

async function startJdbcServer(signal?: AbortSignal): Promise<void> {
  if (await portIsOpen(signal)) return;
  if (serverState.starting) return serverState.starting;
  serverState.starting = (async () => {
    if (signal?.aborted) throw new OperationCancelledError("Starting JDBC adapter");
    const jarPath = await resolveJdbcJar();
    const child = spawn(
      process.platform === "win32" ? "java.exe" : "java",
      ["-jar", jarPath],
      { cwd: JDBC_MANAGED_DIRECTORY, stdio: "pipe" },
    );
    serverState.process = child;
    let spawnError: Error | undefined;
    child.once("error", (error) => { spawnError = error; });
    child.once("exit", () => {
      if (serverState.process === child) serverState.process = undefined;
    });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (signal?.aborted) {
        child.kill();
        throw new OperationCancelledError("Starting JDBC adapter");
      }
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) {
        throw new Error("The JDBC adapter exited before opening port 7823.");
      }
      if (await portIsOpen(signal)) return;
      await delay(150);
    }
    child.kill();
    throw new Error("The JDBC adapter did not open port 7823 within 15 seconds.");
  })();
  try {
    await serverState.starting;
  } finally {
    serverState.starting = undefined;
  }
}

function cancelled(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) throw new OperationCancelledError(operation);
}

function jdbcSql(sql: string): string {
  const normalized = sql.trim().replace(/;+$/g, "");
  if (/^(declare|begin)\b/i.test(normalized)) return `${normalized};`;
  return normalized;
}

function jdbcError(value: unknown, fallback: string): Error {
  const item = record(value);
  return new Error(text(item.fullErr) || text(item.err) || fallback);
}

function createOracleConnector(): DriverConnector {
  return {
    type: "Oracle" as DatabaseType,
    async connect(options, signal): Promise<DriverConnection> {
      cancelled(signal, "Opening Oracle connection");
      await startJdbcServer(signal);
      const config = buildOracleJdbcConfig(options);
      const client = axios.create({
        baseURL: JDBC_BASE_URL,
        timeout: config.requestTimeout,
      });
      const connected = await client.post<JdbcConnectResponse>("/connect", config, { signal });
      if (connected.data.success !== true) {
        throw jdbcError(connected.data, "Oracle JDBC connection failed.");
      }
      let closed = false;
      return {
        async query(sql, queryOptions): Promise<unknown> {
          cancelled(queryOptions?.signal, "Oracle query");
          const querySignal = queryOptions?.signal;
          const cancelQuery = (): void => {
            void client.post("/cancel", config).catch(() => undefined);
          };
          querySignal?.addEventListener("abort", cancelQuery, { once: true });
          const request: Record<string, unknown> = {
            id: config.id,
            sql: jdbcSql(sql),
          };
          if (queryOptions?.params && queryOptions.params.length > 0) {
            request.params = [...queryOptions.params];
          }
          try {
            const response = await client.post<JdbcExecuteResponse>(
              "/execute",
              request,
              { signal: querySignal },
            );
            cancelled(querySignal, "Oracle query");
            if (response.data.err) throw jdbcError(response.data, "Oracle query failed.");
            return {
              rows: response.data.rows || [],
              fields: response.data.columns || [],
              affectedRows: response.data.affectedRows,
            };
          } catch (error) {
            if (querySignal?.aborted) {
              throw new OperationCancelledError("Oracle query");
            }
            throw error;
          } finally {
            querySignal?.removeEventListener("abort", cancelQuery);
          }
        },
        async ping(querySignal): Promise<void> {
          cancelled(querySignal, "Oracle ping");
          const response = await client.post<JdbcAliveResponse>(
            "/alive",
            config,
            { signal: querySignal },
          );
          if (response.data.alive !== true) throw new Error("Oracle JDBC connection is not alive.");
        },
        async close(): Promise<void> {
          if (closed) return;
          closed = true;
          await client.post("/close", config).catch(() => undefined);
        },
      };
    },
  };
}

export function createOracleConnectionFactory(): DriverConnectionFactory {
  return new DriverConnectionFactory(createOracleConnector());
}

export function disposeOracleJdbcServer(): void {
  const child = serverState.process;
  if (!child || child.exitCode !== null) return;
  child.kill();
  serverState.process = undefined;
}
