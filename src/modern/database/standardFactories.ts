import mysql, { type ConnectionOptions as MysqlOptions } from "@cweijan/mysql2/promise";
import { Pool, type PoolConfig } from "pg";

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
import { createNoSqlConnectionFactories } from "./nosqlFactories";
import { createAdditionalConnectionFactories } from "./additionalFactories";
import { createMessageConnectionFactories } from "./messageFactories";
import { createDockerConnectionFactories } from "./dockerFactory";
import { createExtendedConnectionFactories } from "./extendedFactories";
import { createCloudConnectionFactories } from "./cloudFactories";
import { createHttpConnectionFactories } from "./httpFactories";
import { createResourceConnectionFactories } from "./resourceFactories";

function optionValue(
  options: ConnectionOptions,
  key: string,
): unknown {
  return options.options?.[key];
}

function numericOption(
  options: ConnectionOptions,
  key: string,
  fallback: number,
): number {
  const value = optionValue(options, key);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mysqlOptions(options: ConnectionOptions): MysqlOptions {
  const driverOptions: MysqlOptions = {
    host: options.host,
    port: options.port,
    user: options.user,
    password: options.password,
    database: options.database,
    connectTimeout: numericOption(options, "connectTimeout", 30_000),
  };
  const ssl = optionValue(options, "ssl");
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
      const connection = await mysql.createConnection(mysqlOptions(options));
      let closed = false;
      return {
        async query(sql, queryOptions) {
          if (queryOptions?.signal?.aborted) {
            throw new OperationCancelledError("MySQL query");
          }
          return connection.query(sql);
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
  const driverOptions: PoolConfig = {
    host: options.host,
    port: options.port,
    user: options.user,
    password: options.password,
    database: options.database,
    connectionTimeoutMillis: numericOption(options, "connectTimeout", 30_000),
    max: numericOption(options, "maxConnections", 4),
  };
  const ssl = optionValue(options, "ssl");
  if (ssl !== undefined) {
    driverOptions.ssl = ssl as PoolConfig["ssl"];
  }
  return driverOptions;
}

function createPostgresConnector(type: DatabaseType): DriverConnector {
  return {
    type,
    async connect(options, signal): Promise<DriverConnection> {
      if (signal?.aborted) {
        throw new OperationCancelledError("Opening PostgreSQL connection");
      }
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
          return pool.query(sql);
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

export function createStandardConnectionFactories(): DriverConnectionFactory[] {
  return [
    ...mysqlTypes.map(
      (type) => new DriverConnectionFactory(createMysqlConnector(type)),
    ),
    ...postgresTypes.map(
      (type) => new DriverConnectionFactory(createPostgresConnector(type)),
    ),
    ...createNoSqlConnectionFactories(),
    ...createAdditionalConnectionFactories(),
    ...createMessageConnectionFactories(),
    ...createDockerConnectionFactories(),
    ...createExtendedConnectionFactories(),
    ...createCloudConnectionFactories(),
    ...createHttpConnectionFactories(),
    ...createResourceConnectionFactories(),
  ];
}
