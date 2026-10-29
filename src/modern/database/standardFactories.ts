import mysql, { type ConnectionOptions as MysqlOptions } from "@cweijan/mysql2/promise";
import {
  Pool,
  Query as PostgresQuery,
  types as pgTypes,
  type Client as PostgresClient,
  type PoolClient,
  type PoolConfig,
  type QueryArrayConfig,
} from "pg";

import { OperationCancelledError } from "../core/errors";
import {
  DriverConnectionFactory,
  type DriverConnection,
  type DriverConnector,
} from "./driverConnectionFactory";
import type {
  ConnectionOptions,
  DatabaseType,
} from "./types";
import { connectionOption } from "./connectionOptions";
import { createNoSqlConnectionFactories } from "./nosqlFactories";
import { createAdditionalConnectionFactories } from "./additionalFactories";
import { createMessageConnectionFactories } from "./messageFactories";
import { createDockerConnectionFactories } from "./dockerFactory";
import { createExtendedConnectionFactories } from "./extendedFactories";
import { createCloudConnectionFactories } from "./cloudFactories";
import { createHttpConnectionFactories } from "./httpFactories";
import { createResourceConnectionFactories } from "./resourceFactories";
import { buildSslOptions } from "./sslOptions";
import { createOracleConnectionFactory } from "./oracle/jdbcFactory";
import type { ConnectionTunnelService } from "./connectionManager";

function optionValue(
  options: ConnectionOptions,
  key: string,
): unknown {
  return connectionOption(options, key);
}

function numericOption(
  options: ConnectionOptions,
  key: string,
  fallback: number,
): number {
  const value = optionValue(options, key);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function textOption(
  options: ConnectionOptions,
  key: string,
): string | undefined {
  const value = optionValue(options, key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function useConnectionString(options: ConnectionOptions): boolean {
  return optionValue(options, "useConnectionString") === true
    && Boolean(options.connectionUrl?.trim());
}

let postgresTypeParsersConfigured = false;

function configurePostgresTypeParsers(): void {
  if (postgresTypeParsersConfigured) return;
  postgresTypeParsersConfigured = true;
  for (const type of [1114, 1184, 1082, 114, 3802]) {
    pgTypes.setTypeParser(type, (value) => value);
  }
}

function mysqlOptions(options: ConnectionOptions): MysqlOptions {
  const socketPath = options.socketPath || textOption(options, "socketPath");
  const usingSSH = optionValue(options, "usingSSH") === true;
  const driverOptions: MysqlOptions = {
    host: options.host,
    port: options.port,
    user: options.user,
    password: options.password,
    database: options.database,
    connectTimeout: numericOption(options, "connectTimeout", 5_000),
    socketPath: usingSSH ? undefined : socketPath,
    multipleStatements: true,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    insecureAuth: true,
    timezone: textOption(options, "timezone") || "local",
    authPlugins: {
      mysql_clear_password: () => () => Buffer.from(`${options.password || ""}\0`),
    },
  };
  const ssl = buildSslOptions(options);
  if (ssl !== undefined) {
    driverOptions.ssl = ssl as MysqlOptions["ssl"];
  }
  return driverOptions;
}

function createMysqlConnector(type: DatabaseType): DriverConnector {
  return {
    type,
    async connect(options, signal): Promise<DriverConnection> {
      if (signal?.aborted) {
        throw new OperationCancelledError("Opening MySQL connection");
      }
      const connection = useConnectionString(options)
        ? await mysql.createConnection(options.connectionUrl as string)
        : await mysql.createConnection(mysqlOptions(options));
      const sqlMode = textOption(options, "sqlMode");
      const timeZone = textOption(options, "timeZone");
      if (sqlMode) await connection.query(`SET sql_mode = ${sqlLiteral(sqlMode)};`);
      if (timeZone) await connection.query(`SET time_zone = ${sqlLiteral(timeZone)};`);
      let closed = false;
      return {
        async query(sql, queryOptions) {
          if (queryOptions?.signal?.aborted) {
            throw new OperationCancelledError("MySQL query");
          }
          const params = queryOptions?.params;
          return params && params.length > 0
            ? connection.query(sql, [...params])
            : connection.query(sql);
        },
        async ping(querySignal) {
          if (querySignal?.aborted) {
            throw new OperationCancelledError("MySQL ping");
          }
          await connection.ping();
        },
        async close() {
          if (!closed) {
            closed = true;
            await connection.end();
          }
        },
      };
    },
  };
}

function postgresOptions(options: ConnectionOptions): PoolConfig {
  const socketPath = options.socketPath || textOption(options, "socketPath");
  const driverOptions: PoolConfig = {
    host: socketPath || options.host,
    port: options.port,
    user: options.user,
    password: options.password,
    database: options.database,
    connectionTimeoutMillis: numericOption(options, "connectTimeout", 5_000),
    max: numericOption(options, "maxConnections", 4),
    keepAlive: true,
    statement_timeout: numericOption(options, "requestTimeout", 0) || undefined,
  };
  if (useConnectionString(options)) {
    driverOptions.connectionString = options.connectionUrl;
  }
  const ssl = buildSslOptions(options);
  if (ssl !== undefined) {
    driverOptions.ssl = ssl as PoolConfig["ssl"];
  }
  return driverOptions;
}

interface CancellablePostgresClient extends PoolClient {
  cancel(client: PostgresClient, query: PostgresQuery): void;
}

function executePostgresQuery(
  client: PoolClient,
  sql: string,
  params: readonly unknown[] | undefined,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const query = new PostgresQuery({
    text: sql,
    values: params && params.length > 0 ? [...params] : undefined,
    rowMode: "array",
  } as QueryArrayConfig);
  const cancellable = client as CancellablePostgresClient;
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = (): void => {
      if (settled) return;
      try {
        cancellable.cancel(cancellable, query);
      } catch {
        // The pool connection is destroyed by the caller after cancellation.
      }
      finish(() => reject(new OperationCancelledError("PostgreSQL query")));
    };
    query.on("error", (error) => {
      finish(() => reject(
        signal?.aborted
          ? new OperationCancelledError("PostgreSQL query")
          : error,
      ));
    });
    query.on("end", (result) => {
      finish(() => {
        if (signal?.aborted) {
          reject(new OperationCancelledError("PostgreSQL query"));
        } else {
          resolve(result);
        }
      });
    });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      client.query(query);
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
    }
  });
}

function createPostgresConnector(type: DatabaseType): DriverConnector {
  return {
    type,
    async connect(options, signal): Promise<DriverConnection> {
      if (signal?.aborted) {
        throw new OperationCancelledError("Opening PostgreSQL connection");
      }
      configurePostgresTypeParsers();
      const pool = new Pool(postgresOptions(options));
      try {
        await pool.query("select 1");
      } catch (error) {
        await pool.end().catch(() => undefined);
        throw error;
      }
      let closed = false;
      return {
        async query(sql, queryOptions) {
          if (queryOptions?.signal?.aborted) {
            throw new OperationCancelledError("PostgreSQL query");
          }
          const params = queryOptions?.params;
          const client = await pool.connect();
          try {
            return await executePostgresQuery(client, sql, params, queryOptions?.signal);
          } finally {
            client.release(queryOptions?.signal?.aborted ? new Error("PostgreSQL query cancelled") : undefined);
          }
        },
        async ping(querySignal) {
          if (querySignal?.aborted) {
            throw new OperationCancelledError("PostgreSQL ping");
          }
          await pool.query("select 1");
        },
        async close() {
          if (!closed) {
            closed = true;
            await pool.end();
          }
        },
      };
    },
  };
}

const mysqlTypes: readonly DatabaseType[] = ["MySQL", "MariaDB", "MySQLCompatible"];
const postgresTypes: readonly DatabaseType[] = [
  "PostgreSQL",
  "Redshift",
  "Kingbase",
  "GaussDB",
  "Cockroach",
  "PostgreCompatible",
];

export function createStandardConnectionFactories(
  sqliteWasmDirectory?: string,
  tunnels?: ConnectionTunnelService,
): DriverConnectionFactory[] {
  return [
    ...mysqlTypes.map(
      (type) => new DriverConnectionFactory(createMysqlConnector(type)),
    ),
    ...postgresTypes.map(
      (type) => new DriverConnectionFactory(createPostgresConnector(type)),
    ),
    createOracleConnectionFactory(),
    ...createNoSqlConnectionFactories(tunnels),
    ...createAdditionalConnectionFactories(),
    ...createMessageConnectionFactories(),
    ...createDockerConnectionFactories(),
    ...createExtendedConnectionFactories(sqliteWasmDirectory),
    ...createCloudConnectionFactories(),
    ...createHttpConnectionFactories(),
    ...createResourceConnectionFactories(),
  ];
}
