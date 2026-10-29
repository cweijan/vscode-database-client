import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";

import axios from "axios";
import { DBSQLClient } from "@databricks/sql";
import dmdb from "@database-client/dmdb";
import initSqlJs, { type SqlJsDatabase } from "sql.js";

import { OperationCancelledError } from "../core/errors";
import {
  DriverConnectionFactory,
  type DriverConnector,
} from "./driverConnectionFactory";
import type { ConnectionOptions, QueryField } from "./types";

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

function resultFromRows(
  rows: Record<string, unknown>[],
  affectedRows?: number,
  fields?: QueryField[],
) {
  return {
    rows,
    fields: fields ?? Object.keys(rows[0] ?? {}).map((name) => ({ name })),
    affectedRows,
  };
}

function rowsFromSqlJs(result: { columns: string[]; values: unknown[][] }): Record<string, unknown>[] {
  return result.values.map((values) => Object.fromEntries(
    result.columns.map((column, index) => [column, values[index]]),
  ));
}

function bearerToken(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value.startsWith("Bearer ") ? value : `Bearer ${value}`;
}

function libSqlConnector(): DriverConnector {
  return {
    type: "libSQL",
    async connect(options, signal) {
      active(signal, "Opening libSQL connection");
      let endpoint = options.connectionUrl || String(option(options, "url") || "");
      if (!endpoint) {
        const configured = nestedOption(options, "httpAuth", "url");
        endpoint = typeof configured === "string" ? configured : "";
      }
      endpoint = endpoint.replace(/^libsql:\/\//, "https://").replace(/\/$/, "");
      if (!endpoint) throw new Error("libSQL connection URL is required");
      const token = bearerToken(
        option(options, "authToken") ||
        nestedOption(options, "httpAuth", "basicToken") ||
        options.password,
      );
      const client = axios.create({
        baseURL: endpoint,
        timeout: numberOption(options, "requestTimeout", 30_000),
        headers: token ? { Authorization: token } : undefined,
      });
      const execute = async (sql: string, querySignal?: AbortSignal) => {
        active(querySignal, "libSQL query");
        const response = await client.post("/v2/pipeline", {
          requests: [
            { type: "execute", stmt: { sql } },
            { type: "close" },
          ],
        }, { signal: querySignal });
        const payload = response.data as { results?: Array<Record<string, unknown>> };
        const first = payload.results?.[0];
        if (!first || first.type !== "ok") {
          throw new Error(String(first?.error || "libSQL pipeline request failed"));
        }
        const result = (first.response as { result?: Record<string, unknown> } | undefined)?.result || {};
        const columns = Array.isArray(result.cols)
          ? result.cols as QueryField[]
          : [];
        const rawRows = Array.isArray(result.rows) ? result.rows as unknown[][] : [];
        const rows = rawRows.map((row) => Object.fromEntries(
          columns.map((column, index) => {
            const value = row[index];
            return [column.name, value && typeof value === "object" && "value" in value
              ? (value as { value: unknown }).value
              : value];
          }),
        ));
        const affected = (result as { affected_row_count?: number }).affected_row_count;
        return resultFromRows(rows, affected, columns);
      };
      await execute("select 1", signal);
      return {
        async query(sql, queryOptions) {
          return execute(sql, queryOptions?.signal);
        },
        async ping(querySignal) {
          await execute("select 1", querySignal);
        },
        async close() {},
      };
    },
  };
}

function d1Connector(): DriverConnector {
  return {
    type: "D1",
    async connect(options, signal) {
      active(signal, "Opening D1 connection");
      const accountId = String(
        nestedOption(options, "d1", "accountId") || option(options, "accountId") || "",
      );
      if (!accountId) throw new Error("D1 accountId is required");
      const client = axios.create({
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`,
        timeout: numberOption(options, "requestTimeout", 30_000),
        headers: {
          "X-Auth-Email": String(nestedOption(options, "d1", "authEmail") || ""),
          "X-Auth-Key": String(nestedOption(options, "d1", "authKey") || ""),
        },
      });
      const listDatabases = async (querySignal?: AbortSignal) => {
        active(querySignal, "D1 database list");
        const response = await client.get("", { signal: querySignal });
        const payload = response.data as { result?: Array<Record<string, unknown>>; success?: boolean; errors?: Array<{ message?: string }> };
        if (payload.success === false) throw new Error(payload.errors?.[0]?.message || "D1 request failed");
        return payload.result || [];
      };
      const databases = await listDatabases(signal);
      const execute = async (sql: string, querySignal?: AbortSignal) => {
        active(querySignal, "D1 query");
        if (sql.trim().toLowerCase() === "list") {
          return resultFromRows(databases);
        }
        const selected = databases.find((database) => database.name === options.database);
        const databaseId = String(selected?.uuid || "");
        if (!databaseId) throw new Error(`D1 database ${options.database || ""} was not found`);
        const response = await client.post(`${databaseId}/query`, { sql }, { signal: querySignal });
        const payload = response.data as {
          success?: boolean;
          result?: Array<{ results?: Record<string, unknown>[]; meta?: { changed_db?: boolean; changes?: number } }>;
          errors?: Array<{ message?: string }>;
        };
        if (payload.success === false) throw new Error(payload.errors?.[0]?.message || "D1 query failed");
        const rows: Record<string, unknown>[] = [];
        let affectedRows: number | undefined;
        for (const item of payload.result || []) {
          rows.push(...(item.results || []));
          if (item.meta?.changed_db) affectedRows = item.meta.changes;
        }
        return resultFromRows(rows, affectedRows);
      };
      return {
        async query(sql, queryOptions) {
          return execute(sql, queryOptions?.signal);
        },
        async ping(querySignal) {
          await listDatabases(querySignal);
        },
        async close() {},
      };
    },
  };
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

function sqliteConnector(
  type: "SQLite" | "DuckDB" | "libSQL" | "D1",
  sqliteWasmDirectory?: string,
): DriverConnector {
  if (type === "DuckDB") {
    return duckDbConnector();
  }
  if (type === "libSQL") {
    return {
      type,
      async connect(options, signal) {
        if (options.connectionUrl || option(options, "url") || nestedOption(options, "httpAuth", "url")) {
          return libSqlConnector().connect(options, signal);
        }
        return sqliteConnector("SQLite").connect(options, signal);
      },
    };
  }
  if (type === "D1") {
    return {
      type,
      async connect(options, signal) {
        if (nestedOption(options, "d1", "accountId") || option(options, "accountId")) {
          return d1Connector().connect(options, signal);
        }
        return sqliteConnector("SQLite").connect(options, signal);
      },
    };
  }
  return {
    type,
    async connect(options, signal) {
      active(signal, `Opening ${type} connection`);
      const wasmDirectory = sqliteWasmDirectory || path.dirname(require.resolve("sql.js"));
      const SQL = await initSqlJs({ locateFile: (file) => path.join(wasmDirectory, file) });
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
      const { default: snowflake } = await import("snowflake-sdk");
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

export function createExtendedConnectionFactories(
  sqliteWasmDirectory?: string,
): DriverConnectionFactory[] {
  return [
    new DriverConnectionFactory(sqliteConnector("SQLite", sqliteWasmDirectory)),
    new DriverConnectionFactory(sqliteConnector("libSQL", sqliteWasmDirectory)),
    new DriverConnectionFactory(sqliteConnector("D1", sqliteWasmDirectory)),
    new DriverConnectionFactory(sqliteConnector("DuckDB", sqliteWasmDirectory)),
    new DriverConnectionFactory(dmConnector("DM")),
    new DriverConnectionFactory(dmConnector("达梦")),
    new DriverConnectionFactory(snowflakeConnector()),
    new DriverConnectionFactory(databricksConnector()),
  ];
}
