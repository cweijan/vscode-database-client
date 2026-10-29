import axios, { type AxiosInstance, type Method } from "axios";
import { Kafka, type Admin, type Producer } from "kafkajs";

import { OperationCancelledError } from "../core/errors";
import {
  DriverConnectionFactory,
  type DriverConnector,
} from "./driverConnectionFactory";
import type { ConnectionOptions } from "./types";

function option(options: ConnectionOptions, key: string): unknown {
  return options.options?.[key];
}

function requireActive(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) {
    throw new OperationCancelledError(operation);
  }
}

function rowsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (value): value is Record<string, unknown> => Boolean(value && typeof value === "object"),
    );
  }
  return payload && typeof payload === "object"
    ? [payload as Record<string, unknown>]
    : [{ value: payload }];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeLokiRows(response: unknown): Record<string, unknown>[] {
  const root = recordValue(response);
  const payload = root.data === undefined ? response : root.data;
  const data = recordValue(payload);
  const result = data.result === undefined ? payload : data.result;
  if (Array.isArray(result)) {
    return result.map((item) => {
      if (typeof item === "string") return { name: item, value: item };
      return recordValue(item);
    });
  }
  if (result && typeof result === "object") return [recordValue(result)];
  return result === undefined ? [] : [{ value: result }];
}

function fieldsFromRows(rows: Record<string, unknown>[]): Array<{ name: string }> {
  return Object.keys(rows[0] ?? {}).map((name) => ({ name }));
}

function connectionUrl(options: ConnectionOptions, defaultPort: number): string {
  return options.connectionUrl || `http://${options.host || "localhost"}:${options.port || defaultPort}`;
}

function httpClient(options: ConnectionOptions, defaultPort: number): AxiosInstance {
  return axios.create({
    baseURL: connectionUrl(options, defaultPort),
    auth: options.user
      ? { username: options.user, password: options.password || "" }
      : undefined,
    timeout: typeof option(options, "requestTimeout") === "number"
      ? option(options, "requestTimeout") as number
      : 30_000,
  });
}

function parseHttpRequest(source: string): {
  method: Method;
  path: string;
  body?: unknown;
} {
  const match = source.trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)(?:\n([\s\S]*))?$/i);
  if (!match) {
    return { method: "GET", path: source.startsWith("/") ? source : `/${source}` };
  }
  return {
    method: match[1].toUpperCase() as Method,
    path: match[2].startsWith("/") ? match[2] : `/${match[2]}`,
    body: match[3] ? JSON.parse(match[3]) : undefined,
  };
}

function rabbitConnector(): DriverConnector {
  return {
    type: "RabbitMQ",
    async connect(options, signal) {
      requireActive(signal, "Opening RabbitMQ connection");
      const client = httpClient(options, 15672);
      await client.get("/api/overview");
      return {
        async query(source, queryOptions) {
          requireActive(queryOptions?.signal, "RabbitMQ request");
          const request = parseHttpRequest(source);
          const response = await client.request({
            method: request.method,
            url: request.path,
            data: request.body,
          });
          const rows = rowsFromPayload(response.data);
          return { rows, fields: fieldsFromRows(rows) };
        },
        async ping(querySignal) {
          requireActive(querySignal, "RabbitMQ ping");
          await client.get("/api/overview");
        },
        async close() {},
      };
    },
  };
}

function lokiConnector(): DriverConnector {
  return {
    type: "Loki",
    async connect(options, signal) {
      requireActive(signal, "Opening Loki connection");
      const client = httpClient(options, 3100);
      await client.get("/ready");
      return {
        async query(source, queryOptions) {
          requireActive(queryOptions?.signal, "Loki query");
          const request = parseHttpRequest(source);
          const response = await client.request({
            method: request.method,
            url: request.path === "/" ? "/loki/api/v1/query_range" : request.path,
            data: request.body,
          });
          const rows = normalizeLokiRows(response.data);
          return { rows, fields: fieldsFromRows(rows) };
        },
        async ping(querySignal) {
          requireActive(querySignal, "Loki ping");
          await client.get("/ready");
        },
        async close() {},
      };
    },
  };
}

export function kafkaBrokers(options: ConnectionOptions): string[] {
  const configured = option(options, "brokers");
  if (Array.isArray(configured)) {
    return configured.map(String).filter(Boolean);
  }
  if (typeof configured === "string") {
    return configured.split(",").map((value) => value.trim()).filter(Boolean);
  }
  if (options.connectionUrl) {
    return options.connectionUrl.replace(/^kafka:\/\//, "").split(",").filter(Boolean);
  }
  return [`${options.host || "localhost"}:${options.port || 9092}`];
}

export function createKafkaClient(options: ConnectionOptions): Kafka {
  return new Kafka({
    clientId: String(option(options, "clientId") || options.id),
    brokers: kafkaBrokers(options),
    ssl: Boolean(option(options, "ssl")),
    sasl: options.user
      ? { mechanism: "plain", username: options.user, password: options.password || "" }
      : undefined,
  });
}

function createKafkaConnector(): DriverConnector {
  return {
    type: "Kafka",
    async connect(options, signal) {
      requireActive(signal, "Opening Kafka connection");
      const kafka = createKafkaClient(options);
      const admin = kafka.admin();
      const producer = kafka.producer();
      await admin.connect();
      await producer.connect();
      return kafkaConnection(admin, producer);
    },
  };
}

function kafkaConnection(
  admin: Admin,
  producer: Producer,
) {
  return {
    async query(source: string, queryOptions?: { signal?: AbortSignal }) {
      requireActive(queryOptions?.signal, "Kafka request");
      const normalized = source.trim();
      if (/^LIST\s+TOPICS$/i.test(normalized)) {
        const rows = (await admin.listTopics()).map((name) => ({ name }));
        return { rows, fields: [{ name: "name" }] };
      }
      const describe = normalized.match(/^DESCRIBE\s+TOPIC\s+(.+)$/i);
      if (describe) {
        const metadata = await admin.fetchTopicMetadata({ topics: [describe[1].trim()] });
        const rows = metadata.topics;
        return { rows, fields: fieldsFromRows(rows as unknown as Record<string, unknown>[]) };
      }
      const create = normalized.match(/^CREATE\s+TOPIC\s+(.+)$/i);
      if (create) {
        await admin.createTopics({ topics: [{ topic: create[1].trim(), numPartitions: 1, replicationFactor: 1 }] });
        return { rows: [{ topic: create[1].trim(), created: true }], fields: [{ name: "topic" }, { name: "created" }] };
      }
      const remove = normalized.match(/^DELETE\s+TOPIC\s+(.+)$/i);
      if (remove) {
        await admin.deleteTopics({ topics: [remove[1].trim()] });
        return { rows: [{ topic: remove[1].trim(), deleted: true }], fields: [{ name: "topic" }, { name: "deleted" }] };
      }
      const produce = normalized.match(/^PRODUCE\s+(\S+)(?:\s+([\s\S]*))?$/i);
      if (produce) {
        await producer.send({
          topic: produce[1],
          messages: [{ value: produce[2] || "" }],
        });
        return { rows: [{ topic: produce[1], sent: true }], fields: [{ name: "topic" }, { name: "sent" }] };
      }
      throw new Error("Kafka command must be LIST TOPICS, DESCRIBE TOPIC, CREATE TOPIC, DELETE TOPIC, or PRODUCE");
    },
    async ping(querySignal?: AbortSignal) {
      requireActive(querySignal, "Kafka ping");
      await admin.listTopics();
    },
    async close() {
      await Promise.all([admin.disconnect(), producer.disconnect()]);
    },
  };
}

export function createMessageConnectionFactories(): DriverConnectionFactory[] {
  return [
    new DriverConnectionFactory(rabbitConnector()),
    new DriverConnectionFactory(lokiConnector()),
    new DriverConnectionFactory(createKafkaConnector()),
  ];
}
