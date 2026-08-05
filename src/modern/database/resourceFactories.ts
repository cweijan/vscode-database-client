import { Readable, Writable } from "node:stream";

import type { Client as FtpClient } from "basic-ftp";
import type { FileStat, WebDAVClient } from "webdav";

import {
  OperationCancelledError,
  UnsupportedDatabaseOperationError,
} from "../core/errors";
import {
  DriverConnectionFactory,
  type DriverConnector,
} from "./driverConnectionFactory";
import type { ConnectionOptions, QueryField } from "./types";

interface ResourceCommand {
  operation: "LIST" | "READ" | "WRITE" | "DELETE" | "MKDIR" | "RENAME";
  path: string;
  body: string;
}

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

function ensureActive(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) {
    throw new OperationCancelledError(operation);
  }
}

function parseResourceCommand(source: string): ResourceCommand {
  const normalized = source.replace(/\r\n/g, "\n");
  const newline = normalized.indexOf("\n");
  const firstLine = (newline < 0 ? normalized : normalized.slice(0, newline)).trim();
  const body = newline < 0 ? "" : normalized.slice(newline + 1);
  const separator = firstLine.indexOf(" ");
  const operation = (separator < 0 ? firstLine : firstLine.slice(0, separator)).toUpperCase();
  if (!["LIST", "READ", "WRITE", "DELETE", "MKDIR", "RENAME"].includes(operation)) {
    throw new UnsupportedDatabaseOperationError("Resource command", operation || "empty");
  }
  const path = (separator < 0 ? "/" : firstLine.slice(separator + 1).trim()) || "/";
  return {
    operation: operation as ResourceCommand["operation"],
    path,
    body,
  };
}

function resourceFields(): QueryField[] {
  return [
    { name: "name" },
    { name: "path" },
    { name: "kind" },
    { name: "size" },
    { name: "modified" },
  ];
}

function resultRows(rows: Record<string, unknown>[]) {
  return { rows, fields: resourceFields() };
}

async function readFtpFile(client: FtpClient, remotePath: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const destination = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });
  await client.downloadTo(destination, remotePath);
  return Buffer.concat(chunks);
}

function ftpConnector(): DriverConnector {
  return {
    type: "FTP",
    async connect(options, signal) {
      ensureActive(signal, "Opening FTP connection");
      const { Client: FtpClientConstructor } = await import("basic-ftp");
      const client = new FtpClientConstructor(numberOption(options, "requestTimeout", 30_000));
      await client.access({
        host: options.host || "localhost",
        port: options.port || 21,
        user: options.user || "anonymous",
        password: options.password || "guest",
        secure: Boolean(option(options, "useSSL") ?? option(options, "ssl")),
      });
      const execute = async (source: string, querySignal?: AbortSignal) => {
        ensureActive(querySignal, "FTP resource command");
        const command = parseResourceCommand(source);
        switch (command.operation) {
          case "LIST": {
            const entries = await client.list(command.path);
            return resultRows(entries.map((entry) => ({
              name: entry.name,
              path: command.path.replace(/\/$/, "") + "/" + entry.name,
              kind: entry.isDirectory ? "directory" : "file",
              size: entry.size,
              modified: entry.modifiedAt?.toISOString() || entry.rawModifiedAt,
            })));
          }
          case "READ": {
            const content = await readFtpFile(client, command.path);
            return {
              rows: [{ contentBase64: content.toString("base64") }],
              fields: [{ name: "contentBase64" }],
            };
          }
          case "WRITE":
            await client.uploadFrom(Readable.from(Buffer.from(command.body, "base64")), command.path);
            return { rows: [], fields: [] };
          case "DELETE":
            await client.remove(command.path);
            return { rows: [], fields: [] };
          case "MKDIR":
            await client.ensureDir(command.path);
            return { rows: [], fields: [] };
          case "RENAME":
            await client.rename(command.path, command.body.trim());
            return { rows: [], fields: [] };
        }
      };
      return {
        async query(source, queryOptions) {
          return execute(source, queryOptions?.signal);
        },
        async ping(querySignal) {
          ensureActive(querySignal, "FTP ping");
          await client.pwd();
        },
        async close() {
          client.close();
        },
      };
    },
  };
}

function webDavUrl(options: ConnectionOptions): string {
  if (options.connectionUrl) return options.connectionUrl;
  const configured = nestedOption(options, "httpAuth", "url");
  if (typeof configured === "string" && configured) return configured;
  return `http://${options.host || "localhost"}:${options.port || 80}`;
}

function webDavConnector(): DriverConnector {
  return {
    type: "WebDAV",
    async connect(options, signal) {
      ensureActive(signal, "Opening WebDAV connection");
      const authType = nestedOption(options, "httpAuth", "authType");
      const clientOptions = authType === "token"
        ? {
            token: {
              access_token: String(nestedOption(options, "httpAuth", "basicToken") || options.password || ""),
              token_type: "Bearer",
            },
          }
        : {
            username: options.user,
            password: options.password,
          };
      const { createClient } = await import("webdav");
      const client: WebDAVClient = createClient(webDavUrl(options), clientOptions);
      await client.getDirectoryContents("/");
      const execute = async (source: string, querySignal?: AbortSignal) => {
        ensureActive(querySignal, "WebDAV resource command");
        const command = parseResourceCommand(source);
        switch (command.operation) {
          case "LIST": {
            const response = await client.getDirectoryContents(command.path, { details: true });
            const entries = Array.isArray(response) ? response : response.data;
            return resultRows((entries as FileStat[]).map((entry) => ({
              name: entry.basename,
              path: entry.filename,
              kind: entry.type,
              size: entry.size,
              modified: entry.lastmod,
            })));
          }
          case "READ": {
            const content = await client.getFileContents(command.path, { format: "binary" });
            const value = "data" in Object(content) ? (content as { data: Buffer | string }).data : content;
            const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value as string);
            return {
              rows: [{ contentBase64: buffer.toString("base64") }],
              fields: [{ name: "contentBase64" }],
            };
          }
          case "WRITE":
            await client.putFileContents(command.path, Buffer.from(command.body, "base64"));
            return { rows: [], fields: [] };
          case "DELETE":
            await client.deleteFile(command.path);
            return { rows: [], fields: [] };
          case "MKDIR":
            await client.createDirectory(command.path, { recursive: true });
            return { rows: [], fields: [] };
          case "RENAME":
            await client.moveFile(command.path, command.body.trim());
            return { rows: [], fields: [] };
        }
      };
      return {
        async query(source, queryOptions) {
          return execute(source, queryOptions?.signal);
        },
        async ping(querySignal) {
          ensureActive(querySignal, "WebDAV ping");
          await client.getDirectoryContents("/");
        },
        async close() {},
      };
    },
  };
}

function s3Path(source: string): { bucket: string; key: string } {
  const clean = source.replace(/^\/+/, "");
  const separator = clean.indexOf("/");
  return separator < 0
    ? { bucket: clean, key: "" }
    : { bucket: clean.slice(0, separator), key: clean.slice(separator + 1) };
}

function s3Connector(): DriverConnector {
  return {
    type: "S3",
    async connect(options, signal) {
      ensureActive(signal, "Opening S3 connection");
      const {
        CreateBucketCommand,
        DeleteObjectCommand,
        GetObjectCommand,
        ListBucketsCommand,
        ListObjectsV2Command,
        PutObjectCommand,
        S3Client,
      } = await import("@aws-sdk/client-s3");
      const accessKey = String(nestedOption(options, "s3", "accessKey") || options.user || "");
      const secretKey = String(nestedOption(options, "s3", "accessSecret") || options.password || "");
      const useSSL = Boolean(nestedOption(options, "s3", "useSSL") ?? option(options, "ssl") ?? true);
      const endpoint = options.connectionUrl || (options.host
        ? `${useSSL ? "https" : "http"}://${options.host}:${options.port || (useSSL ? 443 : 80)}`
        : undefined);
      const client = new S3Client({
        region: String(nestedOption(options, "s3", "region") || option(options, "region") || "us-east-1"),
        endpoint,
        forcePathStyle: Boolean(nestedOption(options, "s3", "pathStyle")),
        credentials: accessKey ? { accessKeyId: accessKey, secretAccessKey: secretKey } : undefined,
      });
      const execute = async (source: string, querySignal?: AbortSignal) => {
        ensureActive(querySignal, "S3 resource command");
        const command = parseResourceCommand(source);
        switch (command.operation) {
          case "LIST": {
            if (command.path === "/" || command.path === "") {
              const response = await client.send(new ListBucketsCommand({}), { abortSignal: querySignal });
              return resultRows((response.Buckets || []).map((bucket) => ({
                name: bucket.Name || "",
                path: `/${bucket.Name || ""}`,
                kind: "directory",
                modified: bucket.CreationDate?.toISOString(),
              })));
            }
            const { bucket, key } = s3Path(command.path);
            const response = await client.send(new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: key,
              Delimiter: "/",
            }), { abortSignal: querySignal });
            const directories = (response.CommonPrefixes || []).map((item) => {
              const prefix = item.Prefix || "";
              return {
                name: prefix.slice(key.length).replace(/\/$/, ""),
                path: `/${bucket}/${prefix}`,
                kind: "directory",
                size: 0,
              };
            });
            const files = (response.Contents || []).filter((item) => item.Key !== key).map((item) => ({
              name: (item.Key || "").slice(key.length),
              path: `/${bucket}/${item.Key || ""}`,
              kind: "file",
              size: item.Size,
              modified: item.LastModified?.toISOString(),
            }));
            return resultRows([...directories, ...files]);
          }
          case "READ": {
            const { bucket, key } = s3Path(command.path);
            const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: querySignal });
            const bytes = response.Body ? await response.Body.transformToByteArray() : new Uint8Array();
            return {
              rows: [{ contentBase64: Buffer.from(bytes).toString("base64") }],
              fields: [{ name: "contentBase64" }],
            };
          }
          case "WRITE": {
            const { bucket, key } = s3Path(command.path);
            await client.send(new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: Buffer.from(command.body, "base64"),
            }), { abortSignal: querySignal });
            return { rows: [], fields: [] };
          }
          case "DELETE": {
            const { bucket, key } = s3Path(command.path);
            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: querySignal });
            return { rows: [], fields: [] };
          }
          case "MKDIR": {
            const { bucket, key } = s3Path(command.path);
            if (key) {
              await client.send(new PutObjectCommand({
                Bucket: bucket,
                Key: key.replace(/\/$/, "") + "/",
                Body: Buffer.alloc(0),
              }), { abortSignal: querySignal });
            } else {
              await client.send(new CreateBucketCommand({ Bucket: bucket }), { abortSignal: querySignal });
            }
            return { rows: [], fields: [] };
          }
          case "RENAME": {
            const sourcePath = s3Path(command.path);
            const targetPath = s3Path(command.body.trim());
            const object = await client.send(new GetObjectCommand({ Bucket: sourcePath.bucket, Key: sourcePath.key }), { abortSignal: querySignal });
            const bytes = object.Body ? await object.Body.transformToByteArray() : new Uint8Array();
            await client.send(new PutObjectCommand({
              Bucket: targetPath.bucket,
              Key: targetPath.key,
              Body: Buffer.from(bytes),
            }), { abortSignal: querySignal });
            await client.send(new DeleteObjectCommand({ Bucket: sourcePath.bucket, Key: sourcePath.key }), { abortSignal: querySignal });
            return { rows: [], fields: [] };
          }
        }
      };
      await client.send(new ListBucketsCommand({}), { abortSignal: signal });
      return {
        async query(source, queryOptions) {
          return execute(source, queryOptions?.signal);
        },
        async ping(querySignal) {
          await client.send(new ListBucketsCommand({}), { abortSignal: querySignal });
        },
        async close() {
          client.destroy();
        },
      };
    },
  };
}

function etcdConnector(): DriverConnector {
  return {
    type: "etcd",
    async connect(options, signal) {
      ensureActive(signal, "Opening etcd connection");
      const { Etcd3 } = await import("etcd3");
      const hosts = (options.connectionUrl || `http://${options.host || "localhost"}:${options.port || 2379}`)
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean);
      const client = new Etcd3({
        hosts,
        auth: options.user && options.password
          ? { username: options.user, password: options.password }
          : undefined,
      });
      await client.get("__database_client_health__").string();
      return {
        async query(source, queryOptions) {
          ensureActive(queryOptions?.signal, "etcd command");
          const command = parseResourceCommand(source);
          if (command.operation === "READ") {
            const value = await client.get(command.path).string();
            return { rows: [{ key: command.path, value }], fields: [{ name: "key" }, { name: "value" }] };
          }
          if (command.operation === "LIST") {
            const values = await client.getAll().prefix(command.path.replace(/^\//, "")).strings();
            return resultRows(Object.entries(values).map(([key, value]) => ({
              name: key,
              path: `/${key}`,
              kind: "file",
              size: String(value).length,
              value,
            })));
          }
          if (command.operation === "WRITE") {
            await client.put(command.path).value(command.body);
            return { rows: [], fields: [] };
          }
          if (command.operation === "DELETE") {
            await client.delete().key(command.path);
            return { rows: [], fields: [] };
          }
          throw new UnsupportedDatabaseOperationError(command.operation, "etcd");
        },
        async ping(querySignal) {
          ensureActive(querySignal, "etcd ping");
          await client.get("__database_client_health__").string();
        },
        async close() {
          client.close();
        },
      };
    },
  };
}

export function createResourceConnectionFactories(): DriverConnectionFactory[] {
  return [
    new DriverConnectionFactory(ftpConnector()),
    new DriverConnectionFactory(webDavConnector()),
    new DriverConnectionFactory(s3Connector()),
    new DriverConnectionFactory(etcdConnector()),
  ];
}
