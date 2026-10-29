import { OperationCancelledError } from "../core/errors";
import { normalizeDriverResult, normalizeResultValues } from "./resultConverter";
import type {
  ConnectionFactory,
  ConnectionOptions,
  DatabaseConnection,
  DatabaseType,
  QueryOptions,
  QueryResult,
} from "./types";

export interface DriverConnection {
  query(sql: string, options?: QueryOptions): Promise<unknown>;
  close(): Promise<void> | void;
  ping?(signal?: AbortSignal): Promise<void> | void;
}

export interface DriverConnector {
  readonly type: DatabaseType;
  connect(
    options: ConnectionOptions,
    signal?: AbortSignal,
  ): Promise<DriverConnection>;
}

class DriverConnectionAdapter implements DatabaseConnection {
  public constructor(
    public readonly id: string,
    public readonly type: DatabaseType,
    private readonly driver: DriverConnection,
  ) {}

  public async query<Row = Record<string, unknown>>(
    sql: string,
    options?: QueryOptions,
  ): Promise<QueryResult<Row>> {
    if (options?.signal?.aborted) {
      throw new OperationCancelledError("Query");
    }
    return normalizeResultValues(
      normalizeDriverResult<Row>(await this.driver.query(sql, options)),
    );
  }

  public async ping(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new OperationCancelledError("Ping");
    }
    await this.driver.ping?.(signal);
  }

  public async close(): Promise<void> {
    await this.driver.close();
  }
}

export class DriverConnectionFactory implements ConnectionFactory {
  public constructor(private readonly connector: DriverConnector) {}

  public supports(type: DatabaseType): boolean {
    return type === this.connector.type;
  }

  public async create(
    options: ConnectionOptions,
    signal?: AbortSignal,
  ): Promise<DatabaseConnection> {
    if (signal?.aborted) {
      throw new OperationCancelledError("Opening connection");
    }
    const driver = await this.connector.connect(options, signal);
    if (signal?.aborted) {
      await driver.close();
      throw new OperationCancelledError("Opening connection");
    }
    return new DriverConnectionAdapter(options.id, options.type, driver);
  }
}
