import {
  OperationCancelledError,
  UnsupportedDatabaseOperationError,
} from "../core/errors";
import type { Logger } from "../core/contracts";
import type { SshConnectionOptions } from "../remote/sshService";
import type { SshForwardDefinition } from "../remote/sshForwardingService";
import { connectionOption, sshConnectionNamespace } from "./connectionOptions";
import type {
  ConnectionFactory,
  ConnectionFactoryRegistry,
  ConnectionOptions,
  DatabaseConnection,
  DatabaseType,
  QueryOptions,
  QueryResult,
} from "./types";

class RegisteredConnectionFactories implements ConnectionFactoryRegistry {
  private readonly factories: ConnectionFactory[] = [];

  public register(factory: ConnectionFactory): void {
    this.factories.push(factory);
  }

  public resolve(type: DatabaseType): ConnectionFactory {
    const factory = this.factories.find((candidate) => candidate.supports(type));
    if (!factory) {
      throw new UnsupportedDatabaseOperationError("Connection", type);
    }
    return factory;
  }
}

interface ConnectionRecord {
  options: ConnectionOptions;
  connection?: DatabaseConnection;
  opening: Promise<DatabaseConnection>;
  tunnelId?: string;
}

export interface ConnectionTunnelService {
  start(options: SshConnectionOptions, definition: SshForwardDefinition): Promise<void>;
  stop(id: string | number): Promise<void>;
  activePort(id: string | number): number | undefined;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

function defaultPort(type: DatabaseType): number {
  const ports: Readonly<Partial<Record<DatabaseType, number>>> = {
    MySQL: 3306,
    MariaDB: 3306,
    PostgreSQL: 5432,
    MongoDB: 27017,
    Redis: 6379,
    ElasticSearch: 9200,
    RabbitMQ: 5672,
    Kafka: 9092,
    Neo4j: 7687,
  };
  return ports[type] || 0;
}

function endpoint(options: ConnectionOptions): { host: string; port: number } {
  const fallbackHost = text(options.host, "localhost");
  const fallbackPort = options.port && options.port > 0
    ? options.port
    : defaultPort(options.type);
  const source = text(options.connectionUrl);
  if (source) {
    try {
      const parsed = new URL(source.includes("://") ? source : `tcp://${source}`);
      return {
        host: parsed.hostname || fallbackHost,
        port: number(parsed.port, fallbackPort),
      };
    } catch {
      // Fall back to the explicit host and port when the driver URL is not a URL.
    }
  }
  const hostMatch = fallbackHost.match(/^\[([^\]]+)\]:(\d+)$/);
  if (hostMatch) {
    return { host: hostMatch[1], port: number(hostMatch[2], fallbackPort) };
  }
  const portMatch = fallbackHost.match(/^(.+):(\d+)$/);
  return portMatch
    ? { host: portMatch[1], port: number(portMatch[2], fallbackPort) }
    : { host: fallbackHost, port: fallbackPort };
}

function rewriteConnectionUrl(options: ConnectionOptions, host: string, port: number): string | undefined {
  const source = text(options.connectionUrl);
  if (!source) return undefined;
  try {
    const parsed = new URL(source);
    parsed.hostname = host;
    parsed.port = String(port);
    return parsed.toString();
  } catch {
    return source;
  }
}

export function sshOptionsFor(options: ConnectionOptions): SshConnectionOptions {
  const ssh = sshConnectionNamespace(options);
  const nestedOptions: Record<string, unknown> = {
    ...(options.options || {}),
    privateKeyPath: text(ssh.privateKeyPath, text(connectionOption(options, "privateKeyPath"))),
    passphrase: text(ssh.passphrase, text(connectionOption(options, "passphrase"))),
    type: text(ssh.type, text(options.options?.type, "auto")),
    readyTimeout: number(ssh.waitingTime, number(connectionOption(options, "readyTimeout"), 30_000)),
    algorithms: ssh.algorithms || connectionOption(options, "algorithms"),
  };
  return {
    ...options,
    type: "SSH",
    host: text(ssh.host, "localhost"),
    port: number(ssh.port, 22),
    user: text(ssh.username, text(ssh.user, "root")),
    password: text(ssh.password),
    options: nestedOptions,
  };
}

function usesSshTunnel(options: ConnectionOptions): boolean {
  return options.options?.usingSSH === true
    || (options as ConnectionOptions & { readonly usingSSH?: unknown }).usingSSH === true;
}

export class ConnectionManager {
  private readonly factories: ConnectionFactoryRegistry;
  private readonly records = new Map<string, ConnectionRecord>();
  private disposed = false;

  public constructor(
    private readonly logger: Logger,
    private readonly tunnels?: ConnectionTunnelService,
  ) {
    this.factories = new RegisteredConnectionFactories();
  }

  public registerFactory(factory: ConnectionFactory): void {
    this.factories.register(factory);
  }

  public async getConnection(
    options: ConnectionOptions,
    signal?: AbortSignal,
  ): Promise<DatabaseConnection> {
    if (this.disposed) {
      throw new Error("Connection manager has been disposed");
    }
    if (signal?.aborted) {
      throw new OperationCancelledError("Opening connection");
    }

    const existing = this.records.get(options.id);
    if (existing) {
      return existing.opening;
    }

    const factory = this.factories.resolve(options.type);
    const tunnelId = usesSshTunnel(options) && this.tunnels ? `connection:${options.id}` : undefined;
    let effectiveOptions = options;
    if (tunnelId && this.tunnels) {
      const destination = endpoint(options);
      if (!destination.port) {
        throw new Error(`A remote port is required for SSH tunneling ${options.type}`);
      }
      await this.tunnels.start(sshOptionsFor(options), {
        id: tunnelId,
        type: "Local",
        localHost: "127.0.0.1",
        localPort: 0,
        remoteHost: destination.host,
        remotePort: destination.port,
      });
      const localPort = this.tunnels.activePort(tunnelId);
      if (!localPort) {
        await this.tunnels.stop(tunnelId);
        throw new Error("SSH tunnel did not expose a local port");
      }
      effectiveOptions = {
        ...options,
        host: "127.0.0.1",
        port: localPort,
        connectionUrl: rewriteConnectionUrl(options, "127.0.0.1", localPort),
        socketPath: undefined,
      };
    }
    const opening = factory
      .create(effectiveOptions, signal)
      .then((connection) => {
        const record = this.records.get(options.id);
        if (record) {
          record.connection = connection;
        }
        this.logger.debug("Connection opened", {
          id: options.id,
          type: options.type,
        });
        return connection;
      })
      .catch((error: unknown) => {
        this.records.delete(options.id);
        if (tunnelId && this.tunnels) {
          void this.tunnels.stop(tunnelId).catch(() => undefined);
        }
        throw error;
      });
    this.records.set(options.id, { options, opening, tunnelId });
    return opening;
  }

  public async query<Row = Record<string, unknown>>(
    options: ConnectionOptions,
    sql: string,
    queryOptions: QueryOptions = {},
  ): Promise<QueryResult<Row>> {
    if (queryOptions.signal?.aborted) {
      throw new OperationCancelledError("Query");
    }
    const connection = await this.getConnection(options, queryOptions.signal);
    if (queryOptions.signal?.aborted) {
      throw new OperationCancelledError("Query");
    }
    return connection.query<Row>(sql, queryOptions);
  }

  public async close(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) {
      return;
    }
    this.records.delete(id);
    try {
      const connection = record.connection ?? (await record.opening);
      await connection.close();
    } finally {
      if (record.tunnelId && this.tunnels) {
        await this.tunnels.stop(record.tunnelId);
      }
    }
    this.logger.debug("Connection closed", { id });
  }

  public async closeAll(): Promise<void> {
    const ids = [...this.records.keys()];
    await Promise.all(ids.map((id) => this.close(id)));
  }

  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await this.closeAll();
  }

  public activeIds(): readonly string[] {
    return [...this.records.keys()];
  }

  public getOptions(id: string): ConnectionOptions | undefined {
    return this.records.get(id)?.options;
  }
}
