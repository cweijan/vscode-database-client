import axios from "axios";
import { MongoClient, type MongoClientOptions } from "mongodb";
import neo4j from "neo4j-driver";
import Redis, { Cluster, type RedisOptions } from "ioredis";

import { OperationCancelledError } from "../core/errors";
import {
  sshOptionsFor,
  type ConnectionTunnelService,
} from "./connectionManager";
import {
  DriverConnectionFactory,
  type DriverConnector,
} from "./driverConnectionFactory";
import { executeMongoScript } from "./mongoScript";
import { buildSslOptions, sslPathOption } from "./sslOptions";
import { connectionNamespace, connectionOption } from "./connectionOptions";
import type { ConnectionOptions } from "./types";

function optionValue(options: ConnectionOptions, key: string): unknown {
  return connectionOption(options, key);
}

function nestedOption(
  options: ConnectionOptions,
  namespace: string,
  key: string,
): unknown {
  return connectionNamespace(options, namespace)[key];
}

function numberOption(
  options: ConnectionOptions,
  key: string,
  fallback: number,
): number {
  const value = optionValue(options, key);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function requireNotAborted(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) {
    throw new OperationCancelledError(operation);
  }
}

export interface RedisClusterNode {
  readonly host: string;
  readonly port: number;
}

export interface RedisClusterNatMapEntry extends RedisClusterNode {
  readonly localHost: string;
  readonly localPort: number;
}

function redisClusterEndpoint(value: string): RedisClusterNode | undefined {
  const endpoint = value.trim().split("@", 1)[0];
  if (!endpoint) return undefined;
  if (endpoint.startsWith("[")) {
    const closingBracket = endpoint.indexOf("]:");
    if (closingBracket < 0) return undefined;
    const host = endpoint.slice(1, closingBracket);
    const port = Number(endpoint.slice(closingBracket + 2));
    return host && Number.isInteger(port) && port > 0 && port <= 65_535
      ? { host, port }
      : undefined;
  }
  const separator = endpoint.lastIndexOf(":");
  if (separator <= 0) return undefined;
  const host = endpoint.slice(0, separator);
  const port = Number(endpoint.slice(separator + 1));
  return host && Number.isInteger(port) && port > 0 && port <= 65_535
    ? { host, port }
    : undefined;
}

export function parseRedisClusterNodes(value: unknown): RedisClusterNode[] {
  const source = Buffer.isBuffer(value)
    ? value.toString("utf8")
    : typeof value === "string"
      ? value
      : String(value ?? "");
  const nodes: RedisClusterNode[] = [];
  const seen = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3 || !parts[2].split(",").includes("master")) continue;
    const node = redisClusterEndpoint(parts[1]);
    if (!node) continue;
    const key = `${node.host}:${node.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    nodes.push(node);
  }
  return nodes;
}

export function buildRedisClusterNatMap(
  entries: readonly RedisClusterNatMapEntry[],
): Record<string, { host: string; port: number }> {
  return Object.fromEntries(
    entries.map((entry) => [
      `${entry.host}:${entry.port}`,
      { host: entry.localHost, port: entry.localPort },
    ]),
  );
}

async function stopRedisClusterTunnels(
  tunnels: ConnectionTunnelService,
  ids: readonly string[],
): Promise<void> {
  await Promise.all(ids.map((id) => tunnels.stop(id).catch(() => undefined)));
}

async function startRedisClusterTunnels(
  options: ConnectionOptions,
  tunnels: ConnectionTunnelService,
  nodes: readonly RedisClusterNode[],
): Promise<{ ids: string[]; natMap: Record<string, { host: string; port: number }> }> {
  const ssh = sshOptionsFor(options);
  const entries: RedisClusterNatMapEntry[] = [];
  const ids: string[] = [];
  try {
    for (const [index, node] of nodes.entries()) {
      const id = `redis-cluster:${options.id}:${index}`;
      await tunnels.start(ssh, {
        id,
        type: "Local",
        localHost: "127.0.0.1",
        localPort: 0,
        remoteHost: node.host,
        remotePort: node.port,
      });
      const localPort = tunnels.activePort(id);
      if (!localPort) {
        throw new Error(`Redis cluster tunnel did not expose a local port for ${node.host}:${node.port}`);
      }
      ids.push(id);
      entries.push({
        ...node,
        localHost: "127.0.0.1",
        localPort,
      });
    }
  } catch (error) {
    await stopRedisClusterTunnels(tunnels, ids);
    throw error;
  }
  return { ids, natMap: buildRedisClusterNatMap(entries) };
}

function redisArguments(source: string): [string, string[]] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const character of source.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += character;
    }
  }
  if (escaped) current += "\\";
  if (current) parts.push(current);
  const command = parts.shift()?.toUpperCase();
  if (!command) {
    throw new Error("Redis command is empty");
  }
  return [command, parts];
}

function redisConnector(tunnels?: ConnectionTunnelService): DriverConnector {
  return {
    type: "Redis",
    async connect(options, signal) {
      requireNotAborted(signal, "Opening Redis connection");
      const tls = buildSslOptions(options);
      const usingSSH = optionValue(options, "usingSSH") === true;
      const socketPath = options.socketPath || (typeof optionValue(options, "socketPath") === "string"
        ? optionValue(options, "socketPath") as string
        : undefined);
      const redisOptions: RedisOptions = {
        host: socketPath && !usingSSH ? undefined : options.host,
        port: socketPath && !usingSSH ? undefined : options.port,
        path: socketPath && !usingSSH ? socketPath : undefined,
        password: options.password,
        db: options.database == null ? undefined : Number(options.database),
        connectTimeout: numberOption(options, "connectTimeout", 5_000),
        reconnectOnError: () => false,
        tls: tls as RedisOptions["tls"],
        lazyConnect: true,
      };
      const cluster = nestedOption(options, "redis", "cluster") === true
        && !(socketPath && !usingSSH);
      const sshCluster = cluster && usingSSH;
      if (sshCluster && !tunnels) {
        throw new Error("Redis cluster over SSH requires the SSH forwarding service");
      }
      let client: Redis | Cluster | undefined;
      let clusterTunnelIds: string[] = [];
      try {
        if (sshCluster) {
          const bootstrap = new Redis(redisOptions);
          await bootstrap.connect();
          try {
            const nodes = parseRedisClusterNodes(await bootstrap.call("cluster", "nodes"));
            if (nodes.length === 0) {
              throw new Error("Redis cluster did not report any master nodes");
            }
            const clusterTunnels = await startRedisClusterTunnels(options, tunnels!, nodes);
            clusterTunnelIds = clusterTunnels.ids;
            client = new Redis.Cluster(
              [{ host: redisOptions.host, port: redisOptions.port }],
              { redisOptions, natMap: clusterTunnels.natMap },
            );
          } finally {
            bootstrap.disconnect();
          }
        } else {
          client = cluster
            ? new Redis.Cluster(
              [{ host: options.host, port: options.port }],
              { redisOptions },
            )
            : new Redis(redisOptions);
        }
        await client.connect();
        if (!sshCluster) await client.ping();
      } catch (error) {
        client?.disconnect();
        if (tunnels && clusterTunnelIds.length > 0) {
          await stopRedisClusterTunnels(tunnels, clusterTunnelIds);
        }
        throw error;
      }
      if (!client) throw new Error("Redis client was not created");
      const connectedClient = client;
      return {
        async query(sql, queryOptions) {
          requireNotAborted(queryOptions?.signal, "Redis command");
          const [command, args] = redisArguments(sql);
          const restorePayload = command === "RESTORE"
            && args[2]?.startsWith("__DBCLIENT_HEX__")
            ? Buffer.from(args[2].slice("__DBCLIENT_HEX__".length), "hex")
            : undefined;
          const commandArgs: Array<string | Buffer> = restorePayload
            ? [args[0] || "", args[1] || "0", restorePayload, ...args.slice(3)]
            : args;
          const value = await connectedClient.call(command, ...commandArgs);
          return {
            rows: [{ value }],
            fields: [{ name: "value" }],
          };
        },
        async ping(querySignal) {
          requireNotAborted(querySignal, "Redis ping");
          await connectedClient.ping();
        },
        async close() {
          if (connectedClient.status !== "end") {
            await connectedClient.quit();
          }
          if (tunnels && clusterTunnelIds.length > 0) {
            await stopRedisClusterTunnels(tunnels, clusterTunnelIds);
            clusterTunnelIds = [];
          }
        },
      };
    },
  };
}

function mongoUrl(options: ConnectionOptions): string {
  if (options.connectionUrl) {
    return options.connectionUrl;
  }
  const credentials = options.user || options.password
    ? `${encodeURIComponent(options.user ?? "")}:${encodeURIComponent(options.password ?? "")}@`
    : "";
  const database = options.database ? `/${encodeURIComponent(options.database)}` : "";
  return `mongodb://${credentials}${options.host ?? "localhost"}:${options.port ?? 27017}${database}`;
}

function mongoFields(rows: readonly Record<string, unknown>[]): { name: string }[] {
  const names = new Set<string>();
  for (const row of rows) {
    for (const name of Object.keys(row)) names.add(name);
  }
  return [...names].map((name) => ({ name }));
}

function mongoConnector(): DriverConnector {
  return {
    type: "MongoDB",
    async connect(options, signal) {
      requireNotAborted(signal, "Opening MongoDB connection");
      const clientOptions: MongoClientOptions = {
        connectTimeoutMS: numberOption(options, "connectTimeout", 30_000),
        serverSelectionTimeoutMS: numberOption(options, "requestTimeout", 30_000),
        tls: buildSslOptions(options) !== undefined,
        tlsAllowInvalidCertificates: Boolean(optionValue(options, "disableTLSVerification")),
        tlsCAFile: sslPathOption(options, "caPath"),
        tlsCertificateKeyFile: sslPathOption(options, "clientKeyPath")
          || sslPathOption(options, "clientCertPath"),
        authSource: typeof optionValue(options, "authSource") === "string"
          ? optionValue(options, "authSource") as string
          : undefined,
      };
      const client = new MongoClient(mongoUrl(options), clientOptions);
      await client.connect();
      return {
        async query(sql, queryOptions) {
          requireNotAborted(queryOptions?.signal, "MongoDB query");
          const source = sql.trim();
          if (/^show\s+dbs$/i.test(source)) {
            const result = await client.db().admin().listDatabases();
            return { rows: result.databases, fields: [{ name: "name" }] };
          }
          if (/^show\s+version$/i.test(source)) {
            const result = await client.db(options.database).admin().buildInfo();
            return { rows: [result], fields: mongoFields([result]) };
          }
          const collectionNamesMatch = source.match(
            /^db(?:\(['"]?([^'"\)]+)['"]?\))?\.getCollectionNames\(\)$/i,
          );
          if (collectionNamesMatch) {
            const databaseName = collectionNamesMatch[1] || options.database || "test";
            const names = await client.db(databaseName).listCollections().toArray();
            return {
              rows: names.map((collection) => ({
                name: collection.name,
                type: collection.type,
              })),
              fields: [{ name: "name" }, { name: "type" }],
            };
          }
          const dropCollectionMatch = source.match(
            /^db\(['"]?([^'")]+)['"]?\)\.collection\(['"]?([^'")]+)['"]?\)\.drop\(\)$/i,
          );
          if (dropCollectionMatch) {
            const [, databaseName, collectionName] = dropCollectionMatch;
            const dropped = await client
              .db(databaseName || options.database || "test")
              .collection(collectionName)
              .drop();
            return { rows: [{ ok: dropped }], fields: [{ name: "ok" }] };
          }
          const execution = await executeMongoScript(client, source, {
            defaultDatabase: options.database || "test",
            timeoutMs: numberOption(options, "requestTimeout", 30_000),
          });
          requireNotAborted(queryOptions?.signal, "MongoDB query");
          return {
            rows: execution.rows,
            fields: mongoFields(execution.rows),
            affectedRows: execution.affectedRows,
            raw: execution.value,
          };
        },
        async ping(querySignal) {
          requireNotAborted(querySignal, "MongoDB ping");
          await client.db().command({ ping: 1 });
        },
        async close() {
          await client.close();
        },
      };
    },
  };
}

function neo4jConnector(): DriverConnector {
  return {
    type: "Neo4j",
    async connect(options, signal) {
      requireNotAborted(signal, "Opening Neo4j connection");
      const driver = neo4j.driver(
        options.connectionUrl || `bolt://${options.host ?? "localhost"}:${options.port ?? 7687}`,
        neo4j.auth.basic(options.user ?? "neo4j", options.password ?? ""),
      );
      await driver.verifyConnectivity();
      return {
        async query(sql, queryOptions) {
          requireNotAborted(queryOptions?.signal, "Neo4j query");
          const session = driver.session({ database: options.database });
          try {
            const result = await session.run(sql);
            return {
              rows: result.records.map((record) => record.toObject()),
              fields: result.records[0]
                ? result.records[0].keys.map((name) => ({ name }))
                : [],
            };
          } finally {
            await session.close();
          }
        },
        async ping(querySignal) {
          requireNotAborted(querySignal, "Neo4j ping");
          await driver.verifyConnectivity();
        },
        async close() {
          await driver.close();
        },
      };
    },
  };
}

export function elasticSearchRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
    );
  }
  if (!payload || typeof payload !== "object") {
    return [{ value: payload }];
  }
  const response = payload as Record<string, unknown>;
  const hits = response.hits;
  if (hits && typeof hits === "object" && !Array.isArray(hits)) {
    const records = (hits as { hits?: unknown }).hits;
    if (Array.isArray(records)) {
      return records
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item && typeof item === "object" && !Array.isArray(item)),
        )
        .map((item) => {
          const source = item._source;
          return {
            _id: item._id,
            _index: item._index,
            ...(source && typeof source === "object" && !Array.isArray(source)
              ? source as Record<string, unknown>
              : {}),
          };
        });
    }
  }
  return [response];
}

function elasticSearchConnector(): DriverConnector {
  return {
    type: "ElasticSearch",
    async connect(options, signal) {
      requireNotAborted(signal, "Opening Elasticsearch connection");
      const client = axios.create({
        baseURL: options.connectionUrl || `http://${options.host ?? "localhost"}:${options.port ?? 9200}`,
        auth: options.user ? { username: options.user, password: options.password ?? "" } : undefined,
        timeout: numberOption(options, "requestTimeout", 30_000),
        httpsAgent: optionValue(options, "ssl") ? undefined : undefined,
      });
      await client.get("/");
      return {
        async query(sql, queryOptions) {
          requireNotAborted(queryOptions?.signal, "Elasticsearch request");
          const source = sql.trim();
          const methodMatch = source.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)(?:\n([\s\S]*))?$/i);
          const method = methodMatch?.[1]?.toUpperCase() ?? (source.startsWith("{") ? "POST" : "GET");
          const url = methodMatch?.[2] ?? (source.startsWith("{") ? "/_search" : source);
          const bodySource = methodMatch?.[3];
          const bulkRequest = url.includes("/_bulk") || url.endsWith("/_bulk");
          const requestData = bulkRequest
            ? bodySource?.trim()
            : bodySource
              ? JSON.parse(bodySource)
              : source.startsWith("{") ? JSON.parse(source) : undefined;
          const request = await client.request({
            method,
            url: url.startsWith("/") ? url : `/${url}`,
            data: requestData,
            headers: bulkRequest ? { "Content-Type": "application/x-ndjson" } : undefined,
          });
          return { rows: elasticSearchRows(request.data), fields: [], raw: request.data };
        },
        async ping(querySignal) {
          requireNotAborted(querySignal, "Elasticsearch ping");
          await client.get("/");
        },
        async close() {},
      };
    },
  };
}

export function createNoSqlConnectionFactories(
  tunnels?: ConnectionTunnelService,
): DriverConnectionFactory[] {
  return [
    new DriverConnectionFactory(redisConnector(tunnels)),
    new DriverConnectionFactory(mongoConnector()),
    new DriverConnectionFactory(neo4jConnector()),
    new DriverConnectionFactory(elasticSearchConnector()),
  ];
}
