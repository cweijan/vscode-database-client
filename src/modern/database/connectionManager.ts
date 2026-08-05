import {
  OperationCancelledError,
  UnsupportedDatabaseOperationError,
} from "../core/errors";
import type { Logger } from "../core/contracts";
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
}

export class ConnectionManager {
  private readonly factories: ConnectionFactoryRegistry;
  private readonly records = new Map<string, ConnectionRecord>();
  private disposed = false;

  public constructor(private readonly logger: Logger) {
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
    const opening = factory
      .create(options, signal)
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
        throw error;
      });
    this.records.set(options.id, { options, opening });
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
    const connection = record.connection ?? (await record.opening);
    await connection.close();
    this.logger.debug("Connection closed", { id });
  }

  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const ids = [...this.records.keys()];
    await Promise.all(ids.map((id) => this.close(id)));
  }

  public activeIds(): readonly string[] {
    return [...this.records.keys()];
  }
}
