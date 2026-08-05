import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";

import { DBSQLClient } from "@databricks/sql";
import dmdb from "@database-client/dmdb";
import initSqlJs, { type SqlJsDatabase } from "sql.js";
import snowflake from "snowflake-sdk";

import { OperationCancelledError } from "../core/errors";
import {
  DriverConnectionFactory,
  type DriverConnector,
} from "./driverConnectionFactory";
import type { ConnectionOptions } from "./types";

function option(options: ConnectionOptions, key: string): unknown {
  return options.options?.[key];
}

function nestedOption(
  options: ConnectionOptions,
  group: string,
  key: string,
): unknown {
  const value = option(options, group);
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function numberOption(
  options: ConnectionOptions,
  key: string,
  fallback: number,
): number {
  const value = option(options, key);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function active(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) {
    throw new OperationCancelledError(operation);
  }
}

function resultFromRows(rows: Record<string, unknown>[], affectedRows?: number) {
  return {
    rows,
    fields: Object.keys(rows[0] ?? {}).map((name) => ({ name })),
    affectedRows,
  };
}

function rowsFromSqlJs(result: { columns: string[]; values: unknown[][] }): Record<string, unknown>[] {
  return result.values.map((values) => Object.fromEntries(
    result.columns.map((column, index) => [column, values[index]]),
  ));
}

function duckDbConnector(): DriverConnector {
  return {
    type: "DuckDB",
    async connect(options, signal) {
      active(signal, "Opening DuckDB connection");
      const executable = String(option(options, "executable") || option(options, "duckdbPath") || "duckdb");
      const databasePath = options.dbPath || ":memory:";
      const run = (sql: string, querySignal?: AbortSignal): Promise<Record<string, unknown>[]> => {
        active(querySignal, "DuckDB query");
        return new Promise((resolve, reject) => {
          const process = spawn(executable, [databasePath, "-json", "-c", sql], { windowsHide: true });
          const stdout: Buffer[] = [];
          const stderr: Buffer[] = [];
          process.stdout.on("data", (chunk: Buffer | string) => stdout.push(Buffer.from(chunk)));
          process.stderr.on("data", (chunk: Buffer | string) => stderr.push(Buffer.from(chunk)));
          process.once("error", reject);
          process.once("close", (code) => {
            if (code !== 0) {
              reject(new Error(Buffer.concat(stderr).toString("utf8") || `DuckDB exited with code ${code}`));
              return;
            }
            const text = Buffer.concat(stdout).toString("utf8").trim();
            if (!text) {
              resolve([]);
              return;
            }
            try {
              const parsed = JSON.parse(text) as unknown;
              resolve(Array.isArray(parsed) ? parsed as Record<string, unknown>[] : [parsed as Record<string, unknown>]);
            } catch (error) {
              reject(new Error(`DuckDB returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
            }
          });
        });
      };
      await run("SELECT 1", signal);
      return {
        async query(sql, queryOptions) {
          const rows = await run(sql, queryOptions?.signal);
          return resultFromRows(rows);
        },
        async ping(querySignal) {
          await run("SELECT 1", querySignal);
        },
        async close() {},
      };
    },
  };
}

function sqliteConnector(type: "SQLite" | "DuckDB" | "libSQL" | "D1"): DriverConnector {
  if (type === "DuckDB") {
    return duckDbConnector();
  }
  return {
    type,
    async connect(options, signal) {
      active(signal, `Opening ${type} connection`);
      const sqlModulePath = require.resolve("sql.js");
      const SQL = await initSqlJs({ locateFile: (file) => path.join(path.dirname(sqlModulePath), file) });
      const databasePath = options.dbPath || String(option(options, "dbPath") || "");
      const readonly = Boolean(option(options, "readonly"));
      let database: SqlJsDatabase;
      try {
        const bytes = databasePath ? await fs.readFile(databasePath) : undefined;
        database = new SQL.Database(bytes);
      } catch (error) {
        if (!databasePath) throw error;
        throw new Error(`Unable to open SQLite database ${databasePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return {
        async query(sql, queryOptions) {
          active(queryOptions?.signal, `${type} query`);
          const results = database.exec(sql);
          const first = results[0];
          if (!first) {
            return resultFromRows([], database.getRowsModified());
          }
          return resultFromRows(rowsFromSqlJs(first), database.getRowsModified());
        },
        async ping(querySignal) {
          active(querySignal, `${type} ping`);
          database.exec("SELECT 1;");
        },
        async close() {
          try {
            if (databasePath && !readonly) {
              await fs.writeFile(databasePath, Buffer.from(database.export()));
            }
          } finally {
            database.close();
          }
        },
      };
    },
  };
}

function dmConnector(type: "DM" | "达梦"): DriverConnector {
  return {
    type,
    async connect(options, signal) {
      active(signal, "Opening Dameng connection");
      const connection = await dmdb.getConnection({
        connectString: options.connectionUrl || `${options.host || "localhost"}:${options.port || 5236}`,
        user: options.user,
        password: options.password,
        schema: options.schema,
        connectTimeout: numberOption(options, "connectTimeout", 30_000),
      });
      return {
        async query(sql, queryOptions) {
          active(queryOptions?.signal, "Dameng query");
          const result = await connection.execute<Record<string, unknown>>(sql, [], {
            outFormat: dmdb.OUT_FORMAT_OBJECT,
          });
          const rows = result.rows || [];
          return resultFromRows(rows, result.rowsAffected);
        },
        async ping(querySignal) {
          active(querySignal, "Dameng ping");
          await connection.execute("SELECT 1 FROM DUAL");
        },
        async close() {
          await connection.close();
        },
      };
    },
  };
}

function snowflakeConnectionOptions(options: ConnectionOptions): Record<string, unknown> {
  return {
    account: nestedOption(options, "snowflake", "account") || option(options, "account") || options.host,
    username: options.user,
    password: options.password,
    warehouse: nestedOption(options, "snowflake", "warehouse") || option(options, "warehouse"),
    database: options.database,
    schema: options.schema,
    role: nestedOption(options, "snowflake", "role") || option(options, "role"),
    authenticator: nestedOption(options, "snowflake", "authenticator") || option(options, "authenticator"),
  };
}

function snowflakeConnector(): DriverConnector {
  return {
    type: "Snowflake",
    async connect(options, signal) {
      active(signal, "Opening Snowflake connection");
      const connection = snowflake.createConnection(snowflakeConnectionOptions(options));
      await connection.connectAsync();
      const execute = (sql: string): Promise<Record<string, unknown>[]> => new Promise((resolve, reject) => {
        connection.execute({
          sqlText: sql,
          complete(error, _statement, rows) {
            if (error) {
              reject(error);
            } else {
              resolve((rows || []) as Record<string, unknown>[]);
            }
          },
        });
      });
      return {
        async query(sql, queryOptions) {
          active(queryOptions?.signal, "Snowflake query");
          return resultFromRows(await execute(sql));
        },
        async ping(querySignal) {
          active(querySignal, "Snowflake ping");
          await execute("SELECT 1");
        },
        async close() {
          await new Promise<void>((resolve) => connection.destroy(() => resolve()));
        },
      };
    },
  };
}

function databricksConnector(): DriverConnector {
  return {
    type: "Databricks",
    async connect(options, signal) {
      active(signal, "Opening Databricks connection");
      const client = new DBSQLClient();
      await client.connect({
        host: options.host || String(option(options, "host") || ""),
        path: String(nestedOption(options, "databricks", "path") || option(options, "path") || ""),
        token: String(nestedOption(options, "databricks", "token") || option(options, "token") || options.password || ""),
      });
      const session = await client.openSession({
        initialCatalog: options.database,
        initialSchema: options.schema,
      });
      return {
        async query(sql, queryOptions) {
          active(queryOptions?.signal, "Databricks query");
          const operation = await session.executeStatement(sql, { runAsync: true });
          try {
            const rows = await operation.fetchAll() as Record<string, unknown>[];
            return resultFromRows(rows);
          } finally {
            await operation.close();
          }
        },
        async ping(querySignal) {
          active(querySignal, "Databricks ping");
          const operation = await session.executeStatement("SELECT 1", { runAsync: true });
          await operation.close();
        },
        async close() {
          await session.close();
          await client.close();
        },
      };
    },
  };
}

export function createExtendedConnectionFactories(): DriverConnectionFactory[] {
  return [
    new DriverConnectionFactory(sqliteConnector("SQLite")),
    new DriverConnectionFactory(sqliteConnector("libSQL")),
    new DriverConnectionFactory(sqliteConnector("D1")),
    new DriverConnectionFactory(sqliteConnector("DuckDB")),
    new DriverConnectionFactory(dmConnector("DM")),
    new DriverConnectionFactory(dmConnector("达梦")),
    new DriverConnectionFactory(snowflakeConnector()),
    new DriverConnectionFactory(databricksConnector()),
  ];
}
