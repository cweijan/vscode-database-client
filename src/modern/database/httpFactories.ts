import axios, { type AxiosInstance } from "axios";

import { OperationCancelledError } from "../core/errors";
import {
  DriverConnectionFactory,
  type DriverConnector,
} from "./driverConnectionFactory";
import type { ConnectionOptions, QueryField } from "./types";

interface PrestoColumn extends QueryField {
  name: string;
}

interface PrestoResponse {
  columns?: PrestoColumn[];
  data?: unknown[][] | Record<string, unknown>[];
  nextUri?: string;
  updateCount?: number;
  error?: { message?: string };
  stats?: { state?: string };
}

function option(options: ConnectionOptions, key: string): unknown {
  return options.options?.[key];
}

function numberOption(
  options: ConnectionOptions,
  key: string,
  fallback: number,
): number {
  const value = option(options, key);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ensureActive(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) {
    throw new OperationCancelledError(operation);
  }
}

function httpBaseUrl(options: ConnectionOptions, defaultPort: number): string {
  const httpAuth = option(options, "httpAuth");
  const configuredUrl =
    options.connectionUrl ||
    (httpAuth && typeof httpAuth === "object"
      ? (httpAuth as Record<string, unknown>).url
      : undefined) ||
    option(options, "url");
  if (typeof configuredUrl === "string" && configuredUrl.trim()) {
    return configuredUrl.replace(/\/$/, "");
  }
  return `http://${options.host || "localhost"}:${options.port || defaultPort}`;
}

function createHttpClient(
  options: ConnectionOptions,
  defaultPort: number,
): AxiosInstance {
  const client = axios.create({
    baseURL: httpBaseUrl(options, defaultPort),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: numberOption(options, "requestTimeout", 30_000),
    validateStatus: (status) => status >= 200 && status < 300,
  });
  const httpAuth = option(options, "httpAuth");
  const auth = httpAuth && typeof httpAuth === "object"
    ? httpAuth as Record<string, unknown>
    : {};
  const authType = auth.authType;
  if (authType === "account" && options.user) {
    client.defaults.auth = {
      username: options.user,
      password: options.password || "",
    };
  } else if (authType === "token" && typeof auth.basicToken === "string") {
    const token = auth.basicToken.startsWith("Bearer ")
      ? auth.basicToken
      : `Bearer ${auth.basicToken}`;
    client.defaults.headers.common.Authorization = token;
  } else if (options.user) {
    client.defaults.auth = {
      username: options.user,
      password: options.password || "",
    };
  }
  return client;
}

function rowsFromColumns(
  data: unknown,
  columns: PrestoColumn[],
): Record<string, unknown>[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((row) => {
    if (!Array.isArray(row)) {
      return row && typeof row === "object"
        ? row as Record<string, unknown>
        : { value: row };
    }
    return Object.fromEntries(
      columns.map((column, index) => [column.name || `column_${index}`, row[index]]),
    );
  });
}

function prestoConnector(type: "Trino" | "PrestoDB"): DriverConnector {
  const headerPrefix = type === "Trino" ? "X-Trino-" : "X-Presto-";
  return {
    type,
    async connect(options, signal) {
      ensureActive(signal, `Opening ${type} connection`);
      const client = createHttpClient(options, 8080);
      const headers = {
        [`${headerPrefix}User`]: options.user || "dbclient",
        [`${headerPrefix}Catalog`]: options.database || undefined,
        [`${headerPrefix}Schema`]: options.schema || undefined,
      };
      const collect = async (
        firstResponse: PrestoResponse,
        querySignal?: AbortSignal,
      ): Promise<{ rows: Record<string, unknown>[]; fields: PrestoColumn[]; affectedRows?: number }> => {
        let response = firstResponse;
        let columns: PrestoColumn[] = response.columns ?? [];
        const data: unknown[] = Array.isArray(response.data)
          ? [...response.data]
          : [];
        let affectedRows = response.updateCount;
        while (response.nextUri) {
          ensureActive(querySignal, `${type} query`);
          const next = await client.get<PrestoResponse>(response.nextUri, {
            signal: querySignal,
            headers,
          });
          response = next.data;
          if (response.error?.message) {
            throw new Error(response.error.message);
          }
          if (response.stats?.state === "FAILED" || response.stats?.state === "CLIENT_ABORTED") {
            throw new Error(response.error?.message || `${type} query failed`);
          }
          if (response.columns) {
            columns = response.columns;
          }
          if (response.data) data.push(...response.data);
          if (response.updateCount !== undefined) {
            affectedRows = response.updateCount;
          }
        }
        return {
          rows: rowsFromColumns(data, columns),
          fields: columns,
          affectedRows,
        };
      };
      const execute = async (sql: string, querySignal?: AbortSignal) => {
        ensureActive(querySignal, `${type} query`);
        const response = await client.post<PrestoResponse>(
          "/v1/statement",
          sql.trim().replace(/;\s*$/, ""),
          { signal: querySignal, headers },
        );
        return collect(response.data, querySignal);
      };
      await execute("SELECT 1", signal);
      return {
        async query(sql, queryOptions) {
          return execute(sql, queryOptions?.signal);
        },
        async ping(querySignal) {
          await execute("SELECT 1", querySignal);
        },
        async close() {},
      };
    },
  };
}

const tdengineTypes: Record<number, string> = {
  0: "null",
  1: "bool",
  2: "tinyint",
  3: "smallint",
  4: "int",
  5: "bigint",
  6: "float",
  7: "double",
  8: "binary",
  9: "timestamp",
  10: "nchar",
  11: "unsigned tinyint",
  12: "unsigned smallint",
  13: "unsigned int",
  14: "unsigned bigint",
  15: "json",
};

function tdengineConnector(): DriverConnector {
  return {
    type: "TDengine",
    async connect(options, signal) {
      ensureActive(signal, "Opening TDengine connection");
      const client = createHttpClient(options, 6041);
      const requestUrl = `/rest/sql/${encodeURIComponent(options.database || "")}`;
      const execute = async (sql: string, querySignal?: AbortSignal) => {
        ensureActive(querySignal, "TDengine query");
        const response = await client.post(requestUrl, sql, {
          signal: querySignal,
          headers: { "content-type": "text/plain" },
        });
        const payload = response.data as {
          code?: number;
          status?: string;
          desc?: string;
          column_meta?: Array<[string, number, number]>;
          data?: unknown[][];
          rows?: number;
        };
        if (payload.code !== 0 && payload.status !== "succ") {
          throw new Error(payload.desc || "TDengine request failed");
        }
        const fields: QueryField[] = (payload.column_meta || []).map((meta) => ({
          name: meta[0],
          type: tdengineTypes[meta[1]] || `unknown:${meta[1]}`,
          size: meta[2],
        }));
        if (fields[0]?.name === "affected_rows") {
          const affectedRows = payload.rows ?? Number(payload.data?.[0]?.[0] ?? 0);
          return { rows: [], fields, affectedRows };
        }
        const rows = (payload.data || []).map((row) => Object.fromEntries(
          fields.map((field, index) => [field.name, row[index]]),
        ));
        return { rows, fields };
      };
      await execute("select 1", signal);
      return {
        async query(sql, queryOptions) {
          return execute(sql, queryOptions?.signal);
        },
        ping: async (querySignal) => {
          await execute("select 1", querySignal);
        },
        async close() {},
      };
    },
  };
}

export function createHttpConnectionFactories(): DriverConnectionFactory[] {
  return [
    new DriverConnectionFactory(prestoConnector("Trino")),
    new DriverConnectionFactory(prestoConnector("PrestoDB")),
    new DriverConnectionFactory(tdengineConnector()),
  ];
}
