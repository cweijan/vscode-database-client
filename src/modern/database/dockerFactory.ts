import axios, { type AxiosInstance, type Method } from "axios";

import { OperationCancelledError } from "../core/errors";
import {
  DriverConnectionFactory,
  type DriverConnector,
} from "./driverConnectionFactory";
import type { ConnectionOptions } from "./types";

function option(options: ConnectionOptions, key: string): unknown {
  return options.options?.[key];
}

function active(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) {
    throw new OperationCancelledError(operation);
  }
}

function parseRequest(source: string): { method: Method; path: string; data?: unknown } {
  const match = source.trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)(?:\n([\s\S]*))?$/i);
  if (!match) {
    return { method: "GET", path: source.startsWith("/") ? source : `/${source}` };
  }
  return {
    method: match[1].toUpperCase() as Method,
    path: match[2].startsWith("/") ? match[2] : `/${match[2]}`,
    data: match[3] ? JSON.parse(match[3]) : undefined,
  };
}

function rows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (value): value is Record<string, unknown> => Boolean(value && typeof value === "object"),
    );
  }
  if (payload && typeof payload === "object") {
    return [payload as Record<string, unknown>];
  }
  return [{ value: payload }];
}

function dockerClient(options: ConnectionOptions): AxiosInstance {
  const socketPath = options.socketPath || option(options, "socketPath");
  return axios.create({
    baseURL: options.connectionUrl || "http://localhost",
    socketPath: typeof socketPath === "string" ? socketPath : undefined,
    headers: { "Content-Type": "application/json" },
    timeout: typeof option(options, "requestTimeout") === "number"
      ? option(options, "requestTimeout") as number
      : 30_000,
  });
}

function dockerConnector(): DriverConnector {
  return {
    type: "Docker",
    async connect(options, signal) {
      active(signal, "Opening Docker connection");
      const client = dockerClient(options);
      await client.get("/version");
      return {
        async query(source, queryOptions) {
          active(queryOptions?.signal, "Docker request");
          const request = parseRequest(source);
          const response = await client.request({
            method: request.method,
            url: request.path,
            data: request.data,
          });
          const resultRows = rows(response.data);
          return {
            rows: resultRows,
            fields: Object.keys(resultRows[0] ?? {}).map((name) => ({ name })),
          };
        },
        async ping(querySignal) {
          active(querySignal, "Docker ping");
          await client.get("/_ping");
        },
        async close() {},
      };
    },
  };
}

export function createDockerConnectionFactories(): DriverConnectionFactory[] {
  return [new DriverConnectionFactory(dockerConnector())];
}
