export type DatabaseType =
  | "MySQL"
  | "MariaDB"
  | "PostgreSQL"
  | "Oracle"
  | "SqlServer"
  | "SQLite"
  | "libSQL"
  | "ClickHouse"
  | "Doris"
  | "Databricks"
  | "BigQuery"
  | "Snowflake"
  | "DuckDB"
  | "TDengine"
  | "Trino"
  | "PrestoDB"
  | "Hive"
  | "Athena"
  | "Cassandra"
  | "Db2"
  | "Db2 for i"
  | "AzureSQLServer"
  | "Exasol"
  | "ElasticSearch"
  | "MongoDB"
  | "Redis"
  | "Kafka"
  | "RabbitMQ"
  | "Loki"
  | "SSH"
  | "SFTP"
  | "FTP"
  | "S3"
  | "WebDAV"
  | "Docker"
  | "Neo4j"
  | "RDP"
  | "etcd"
  | "Zookeeper"
  | "DM"
  | "JDBC"
  | (string & {});

export interface ConnectionOptions {
  id: string;
  type: DatabaseType;
  name?: string;
  group?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  schema?: string;
  socketPath?: string;
  connectionUrl?: string;
  dbPath?: string;
  /** Target 9.x keeps standalone SSH settings in this top-level namespace. */
  sshConnect?: Record<string, unknown>;
  ssh?: Record<string, unknown>;
  usingSSH?: boolean;
  redis?: Record<string, unknown>;
  rdpConfig?: Record<string, unknown>;
  advance?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface QueryField {
  name: string;
  type?: string;
  [key: string]: unknown;
}

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  fields: QueryField[];
  affectedRows?: number;
  raw?: unknown;
}

export interface QueryOptions {
  signal?: AbortSignal;
  showError?: boolean;
  sessionId?: string;
  /** Driver values for parameterized statements, including binary values. */
  params?: readonly unknown[];
}

export interface DatabaseConnection {
  readonly id: string;
  readonly type: DatabaseType;
  query<Row = Record<string, unknown>>(
    sql: string,
    options?: QueryOptions,
  ): Promise<QueryResult<Row>>;
  ping?(signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

export interface ConnectionFactory {
  supports(type: DatabaseType): boolean;
  create(
    options: ConnectionOptions,
    signal?: AbortSignal,
  ): Promise<DatabaseConnection>;
}

export interface ConnectionFactoryRegistry {
  register(factory: ConnectionFactory): void;
  resolve(type: DatabaseType): ConnectionFactory;
}

export interface Dialect {
  readonly id: string;
  supports(type: DatabaseType): boolean;
  quoteIdentifier(identifier: string): string;
  escapeLiteral(value: string): string;
  buildPageSql(schema: string | null, table: string, limit: number): string;
  showTables(schema?: string | null): string;
  showColumns(schema: string | null, table: string): string;
  showSynonyms?(owner: string): string;
  showDatabases?(): string;
  showSchemas?(database?: string | null): string;
  createDatabase?(): string | null;
  showViews?(schema?: string | null): string;
  showTableSource?(schema: string | null, table: string): string;
  showViewSource?(schema: string | null, view: string): string;
  showProcedures?(schema?: string | null): string;
  showFunctions?(schema?: string | null): string;
  showTriggers?(schema?: string | null, table?: string | null): string;
  showEvents?(schema?: string | null): string;
  showRoutineSource?(
    kind: "procedure" | "function" | "trigger",
    schema: string | null,
    name: string,
  ): string;
  showEventSource?(schema: string | null, name: string): string;
  showPackages?(schema?: string | null): string;
  showPackageSource?(schema: string | null, name: string): string;
  showIndex?(schema: string | null, table: string): string;
  showForeignKeys?(schema: string | null, table?: string): string;
  showChecks?(schema: string | null, table: string): string;
  showMaterialViews?(schema?: string | null): string;
  showSequences?(schema?: string | null): string;
  showCustomTypes?(schema?: string | null): string;
  showExternalTables?(schema?: string | null): string;
  showPartitions?(schema: string | null, table: string): string;
  showVersion?(): string;
  processList?(): string;
  kill?(process: Record<string, unknown>): string | null;
  dropDatabase?(database: string): string;
  truncateDatabase?(schema: string): string;
  pingDatabase?(schema?: string | null): string | null;
  tableTemplate?(): string;
  viewTemplate?(): string;
  procedureTemplate?(): string;
  functionTemplate?(): string;
  triggerTemplate?(table?: string): string;
  eventTemplate?(): string;
  packageTemplate?(): string;
  showUsers?(): string;
  showDatabaseUsers?(): string;
  showRoles?(): string;
  showDatabaseRoles?(): string;
  showLogins?(): string;
  createUser?(): string;
  updateUser?(username: string, host?: string | null): string;
  createRole?(): string;
  updateRole?(role: string): string;
  dropRole?(role: string): string;
  grantRole?(role: string): string;
  createLogin?(): string;
  updateLogin?(login: string): string;
  dropLogin?(login: string): string;
}

export interface MetadataQueryExecutor {
  query<Row = Record<string, unknown>>(
    sql: string,
    options?: QueryOptions,
  ): Promise<QueryResult<Row>>;
}
