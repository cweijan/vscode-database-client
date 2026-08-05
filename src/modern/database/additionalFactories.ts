import axios from "axios";
import { Connection, Request, type ConnectionConfiguration } from "tedious";

import { OperationCancelledError } from "../core/errors";
import {
  DriverConnectionFactory,
  type DriverConnector,
} from "./driverConnectionFactory";
import type { ConnectionOptions } from "./types";

function option(options: ConnectionOptions, key: string): unknown {
  return options.options?.[key];
}

function timeout(options: ConnectionOptions, key: string, fallback: number): number {
  const value = option(options, key);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ensureActive(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) {
    throw new OperationCancelledError(operation);
  }
}

function sqlServerConfig(options: ConnectionOptions): ConnectionConfiguration {
  return {
    server: options.host || "localhost",
    options: {
      port: options.port || 1433,
      database: options.database || undefined,
      encrypt: Boolean(option(options, "encrypt") ?? option(options, "ssl")),
      trustServerCertificate: true,
      connectTimeout: timeout(options, "connectTimeout", 30_000),
      requestTimeout: timeout(options, "requestTimeout", 30_000),
      instanceName: typeof option(options, "instanceName") === "string"
        ? option(options, "instanceName") as string
        : undefined,
    },
    authentication: {
      type: "default",
      options: {
        userName: options.user,
        password: options.password,
      },
    },
  };
}

function connectSqlServer(config: ConnectionConfiguration): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const connection = new Connection(config);
    let settled = false;
    connection.once("connect", (error) => {
      settled = true;
      if (error) {
        reject(error);
      } else {
        resolve(connection);
      }
    });
    connection.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function sqlServerConnector(type: "SqlServer" | "AzureSQLServer" = "SqlServer"): DriverConnector {
  return {
    type,
    async connect(options, signal) {
      ensureActive(signal, "Opening SQL Server connection");
      const connection = await connectSqlServer(sqlServerConfig(options));
      const runQuery = async (sql: string, queryOptions?: { signal?: AbortSignal }): Promise<unknown> => {
        ensureActive(queryOptions?.signal, "SQL Server query");
        return new Promise((resolve, reject) => {
          const rows: Record<string, unknown>[] = [];
          const fields: Array<{ name: string }> = [];
          const request = new Request(sql, (error, rowCount) => {
            if (error) {
              reject(error);
              return;
            }
            resolve({ rows, fields, rowCount });
          });
          request.on("columnMetadata", (columns) => {
            const list = Array.isArray(columns) ? columns : Object.values(columns);
            for (const column of list) {
              fields.push({ name: column.colName });
            }
          });
          request.on("row", (columns) => {
            const row: Record<string, unknown> = {};
            for (const column of columns) {
              row[column.metadata.colName] = column.value;
            }
            rows.push(row);
          });
          connection.execSql(request);
        });
      };
      return {
        query: runQuery,
        async ping(querySignal) {
          ensureActive(querySignal, "SQL Server ping");
          await runQuery("SELECT 1", { signal: querySignal });
        },
        async close() {
          connection.close();
        },
      };
    },
  };
}

function clickHouseConnector(type: "ClickHouse" | "Doris" = "ClickHouse"): DriverConnector {
  return {
    type,
    async connect(options, signal) {
      ensureActive(signal, "Opening ClickHouse connection");
      const client = axios.create({
        baseURL: options.connectionUrl || `http://${options.host ?? "localhost"}:${options.port ?? 8123}`,
        auth: options.user ? { username: options.user, password: options.password ?? "" } : undefined,
        timeout: timeout(options, "requestTimeout", 30_000),
      });
      await client.get("/", { params: { query: "SELECT 1" } });
      return {
        async query(sql, queryOptions) {
          ensureActive(queryOptions?.signal, "ClickHouse query");
          const response = await client.post("/", sql, {
            params: { query: `${sql.trim().replace(/;$/, "")} FORMAT JSON` },
            headers: { "content-type": "text/plain" },
          });
          const data = response.data as { data?: unknown[]; meta?: unknown[]; rows?: number };
          return {
            rows: data.data ?? [],
            fields: data.meta ?? [],
            rowCount: data.rows,
          };
        },
        async ping(querySignal) {
          ensureActive(querySignal, "ClickHouse ping");
          await client.get("/", { params: { query: "SELECT 1" } });
        },
        async close() {},
      };
    },
  };
}

export function createAdditionalConnectionFactories(): DriverConnectionFactory[] {
  return [
    new DriverConnectionFactory(sqlServerConnector("SqlServer")),
    new DriverConnectionFactory(sqlServerConnector("AzureSQLServer")),
    new DriverConnectionFactory(clickHouseConnector("ClickHouse")),
    new DriverConnectionFactory(clickHouseConnector("Doris")),
  ];
}
