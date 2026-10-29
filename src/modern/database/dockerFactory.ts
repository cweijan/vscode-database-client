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

interface DockerRequest {
  readonly method: Method;
  readonly path: string;
  readonly data?: unknown;
  readonly execCommand?: readonly string[];
}

function parseRequest(source: string): DockerRequest {
  const exec = source.trim().match(/^EXEC\s+(\S+)(?:\n([\s\S]*))?$/i);
  if (exec) {
    const command = exec[2] ? JSON.parse(exec[2]) : [];
    if (!Array.isArray(command) || !command.every((part) => typeof part === "string")) {
      throw new Error("Docker EXEC command must be a string array");
    }
    return {
      method: "POST",
      path: exec[1].startsWith("/") ? exec[1] : `/${exec[1]}`,
      execCommand: command,
    };
  }
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

function dockerExecText(value: unknown): string {
  const buffer = Buffer.isBuffer(value)
    ? value
    : value instanceof ArrayBuffer
      ? Buffer.from(value)
      : typeof value === "string"
        ? Buffer.from(value)
        : Buffer.from(String(value ?? ""));
  const chunks: Buffer[] = [];
  let offset = 0;
  while (buffer.length - offset >= 8) {
    const length = buffer.readUInt32BE(offset + 4);
    if (length < 0 || offset + 8 + length > buffer.length) {
      return buffer.toString("utf8");
    }
    chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  return chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : buffer.toString("utf8");
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
          if (request.execCommand) {
            const created = await client.post(`${request.path}/exec`, {
              AttachStdin: false,
              AttachStdout: true,
              AttachStderr: true,
              Tty: false,
              Cmd: request.execCommand,
            });
            const execId = created.data && typeof created.data === "object"
              ? (created.data as Record<string, unknown>).Id
              : undefined;
            if (typeof execId !== "string" || !execId) {
              throw new Error("Docker did not return an exec id");
            }
            const started = await client.post(
              `/exec/${encodeURIComponent(execId)}/start`,
              { Detach: false, Tty: false },
              { responseType: "arraybuffer" },
            );
            const output = dockerExecText(started.data);
            return {
              rows: [{ output }],
              fields: [{ name: "output" }],
            };
          }
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
