import axios from "axios";
import { MongoClient, type MongoClientOptions } from "mongodb";
import neo4j from "neo4j-driver";
import Redis from "ioredis";

import { OperationCancelledError } from "../core/errors";
import {
  DriverConnectionFactory,
  type DriverConnector,
} from "./driverConnectionFactory";
import type { ConnectionOptions } from "./types";

function optionValue(options: ConnectionOptions, key: string): unknown {
  return options.options?.[key];
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

function redisConnector(): DriverConnector {
  return {
    type: "Redis",
    async connect(options, signal) {
      requireNotAborted(signal, "Opening Redis connection");
      const client = new Redis({
        host: options.host,
        port: options.port,
        path: options.socketPath,
        password: options.password,
        db: options.database == null ? undefined : Number(options.database),
        connectTimeout: numberOption(options, "connectTimeout", 30_000),
        tls: optionValue(options, "ssl") ? { rejectUnauthorized: false } : undefined,
        lazyConnect: true,
      });
      try {
        await client.connect();
        await client.ping();
      } catch (error) {
        client.disconnect();
        throw error;
      }
      return {
        async query(sql, queryOptions) {
          requireNotAborted(queryOptions?.signal, "Redis command");
          const [command, args] = redisArguments(sql);
          const value = await client.call(command, ...args);
          return {
            rows: [{ value }],
            fields: [{ name: "value" }],
          };
        },
        async ping(querySignal) {
          requireNotAborted(querySignal, "Redis ping");
          await client.ping();
        },
        async close() {
          if (client.status !== "end") {
            await client.quit();
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

function mongoConnector(): DriverConnector {
  return {
    type: "MongoDB",
    async connect(options, signal) {
      requireNotAborted(signal, "Opening MongoDB connection");
      const clientOptions: MongoClientOptions = {
        connectTimeoutMS: numberOption(options, "connectTimeout", 30_000),
        serverSelectionTimeoutMS: numberOption(options, "requestTimeout", 30_000),
        tls: Boolean(optionValue(options, "ssl")),
        tlsAllowInvalidCertificates: true,
      };
      const client = new MongoClient(mongoUrl(options), clientOptions);
      await client.connect();
      return {
        async query(sql, queryOptions) {
          requireNotAborted(queryOptions?.signal, "MongoDB query");
          if (/^show\s+dbs$/i.test(sql.trim())) {
            const result = await client.db().admin().listDatabases();
            return { rows: result.databases, fields: [{ name: "name" }] };
          }
          const collectionNamesMatch = sql.match(
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
          const dropCollectionMatch = sql.match(
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
          const insertMatch = sql.match(
            /^db\(['"]?([^'")]+)['"]?\)\.collection\(['"]?([^'")]+)['"]?\)\.insertOne\((.*)\)$/is,
          );
          if (insertMatch) {
            const [, databaseName, collectionName, documentSource] = insertMatch;
            const inserted = await client
              .db(databaseName || options.database || "test")
              .collection(collectionName)
              .insertOne(JSON.parse(documentSource));
            return {
              rows: [{ acknowledged: inserted.acknowledged, insertedId: inserted.insertedId }],
              fields: [{ name: "acknowledged" }, { name: "insertedId" }],
            };
          }
          const match = sql.match(
            /^db\(['"]?([^'"\)]+)['"]?\)\.collection\(['"]?([^'"\)]+)['"]?\)\.(find|findOne)\((.*)\)(?:\.limit\((\d+)\))?$/is,
          );
          if (!match) {
            throw new Error("MongoDB query must use db().collection().find() syntax");
          }
          const [, databaseName, collectionName, operation, filterSource, limitSource] = match;
          const collection = client
            .db(databaseName || options.database || "test")
            .collection(collectionName);
          const filter = filterSource.trim() ? JSON.parse(filterSource) : {};
          if (operation.toLowerCase() === "findone") {
            const row = await collection.findOne(filter);
            return { rows: row ? [row] : [], fields: [] };
          }
          const cursor = collection.find(filter);
          if (limitSource) {
            cursor.limit(Number(limitSource));
          }
          return { rows: await cursor.toArray(), fields: [] };
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
          const requestData = bodySource ? JSON.parse(bodySource) : source.startsWith("{") ? JSON.parse(source) : undefined;
          const request = await client.request({
            method,
            url: url.startsWith("/") ? url : `/${url}`,
            data: requestData,
          });
          const payload = request.data as Record<string, unknown>;
          const hits = (payload.hits as { hits?: Array<Record<string, unknown>> } | undefined)?.hits;
          const rows = hits?.map((hit) => ({
            _id: hit._id,
            _index: hit._index,
            ...(hit._source as Record<string, unknown> | undefined),
          })) ?? [payload];
          return { rows, fields: [] };
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

export function createNoSqlConnectionFactories(): DriverConnectionFactory[] {
  return [
    new DriverConnectionFactory(redisConnector()),
    new DriverConnectionFactory(mongoConnector()),
    new DriverConnectionFactory(neo4jConnector()),
    new DriverConnectionFactory(elasticSearchConnector()),
  ];
}
