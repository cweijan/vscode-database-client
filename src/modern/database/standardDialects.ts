import type { DatabaseType, Dialect } from "./types";
import { OracleDialect } from "./oracle/oracleDialect";

const noSqlTypes = new Set([
  "ElasticSearch",
  "MongoDB",
  "Redis",
  "Neo4j",
  "Cassandra",
  "FTP",
  "SFTP",
  "SSH",
  "Docker",
  "RabbitMQ",
  "Kafka",
]);

function normalized(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function limitValue(limit: number): number {
  return Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 100));
}

function schemaFilter(schema: string | null | undefined): string {
  return schema ? `TABLE_SCHEMA = '${schema.replaceAll("'", "''")}'` : "1 = 1";
}

abstract class InformationSchemaDialect implements Dialect {
  public abstract readonly id: string;

  protected constructor(private readonly types: readonly DatabaseType[]) {}

  public supports(type: DatabaseType): boolean {
    return this.types.includes(type);
  }

  public quoteIdentifier(identifier: string): string {
    const value = normalized(identifier);
    if (!value) {
      throw new Error(`${this.id} identifier cannot be empty`);
    }
    return `"${value.replaceAll('"', '""')}"`;
  }

  public escapeLiteral(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
  }

  public buildPageSql(
    _schema: string | null,
    table: string,
    limit: number,
  ): string {
    return `SELECT * FROM ${table} LIMIT ${limitValue(limit)};`;
  }

  public showTables(schema?: string | null): string {
    return `SELECT TABLE_NAME "name" FROM information_schema.TABLES WHERE ${schemaFilter(schema)} AND TABLE_TYPE <> 'VIEW' ORDER BY TABLE_NAME;`;
  }

  public showColumns(schema: string | null, table: string): string {
    return `SELECT COLUMN_NAME "name", DATA_TYPE "type", IS_NULLABLE "nullable" FROM information_schema.columns WHERE ${schemaFilter(schema)} AND TABLE_NAME = ${this.escapeLiteral(table)} ORDER BY ORDINAL_POSITION;`;
  }

  public showViews(schema?: string | null): string {
    return `SELECT TABLE_NAME "name" FROM information_schema.VIEWS WHERE ${schemaFilter(schema)} ORDER BY TABLE_NAME;`;
  }

  public showDatabases(): string {
    return "SELECT SCHEMA_NAME AS \"Database\" FROM information_schema.schemata ORDER BY SCHEMA_NAME;";
  }

  public showSchemas(): string {
    return this.showDatabases();
  }

  public showTableSource(schema: string | null, table: string): string {
    return `SHOW CREATE TABLE ${schema ? `${this.quoteIdentifier(schema)}.` : ""}${this.quoteIdentifier(table)};`;
  }

  public showViewSource(schema: string | null, view: string): string {
    return `SHOW CREATE VIEW ${schema ? `${this.quoteIdentifier(schema)}.` : ""}${this.quoteIdentifier(view)};`;
  }

  public showProcedures(schema?: string | null): string {
    return `SELECT ROUTINE_NAME "name" FROM information_schema.routines WHERE ${schemaFilter(schema)} AND ROUTINE_TYPE = 'PROCEDURE' ORDER BY ROUTINE_NAME;`;
  }

  public showFunctions(schema?: string | null): string {
    return `SELECT ROUTINE_NAME "name" FROM information_schema.routines WHERE ${schemaFilter(schema)} AND ROUTINE_TYPE = 'FUNCTION' ORDER BY ROUTINE_NAME;`;
  }

  public showTriggers(schema?: string | null): string {
    return `SELECT TRIGGER_NAME "name" FROM information_schema.TRIGGERS WHERE ${schemaFilter(schema)} ORDER BY TRIGGER_NAME;`;
  }

  public showRoutineSource(
    kind: "procedure" | "function" | "trigger",
    schema: string | null,
    name: string,
  ): string {
    const objectName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(name)}`
      : this.quoteIdentifier(name);
    return `SHOW CREATE ${kind.toUpperCase()} ${objectName};`;
  }

  public showVersion(): string {
    return "SELECT VERSION() AS server_version;";
  }

  public processList(): string {
    return "SELECT * FROM information_schema.PROCESSLIST;";
  }

  public showIndex(schema: string | null, table: string): string {
    return `SELECT * FROM information_schema.statistics WHERE TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema))} AND TABLE_NAME = ${this.escapeLiteral(table)} ORDER BY INDEX_NAME;`;
  }

  public pingDatabase(): string | null {
    return "SELECT 1;";
  }

  public tableTemplate(): string {
    return "CREATE TABLE table_name (\n  id INTEGER PRIMARY KEY,\n  column_name VARCHAR(255)\n);";
  }

  public viewTemplate(): string {
    return "CREATE VIEW view_name AS\nSELECT * FROM table_name;";
  }

  public procedureTemplate(): string {
    return "CREATE PROCEDURE procedure_name()\nBEGIN\nEND;";
  }

  public functionTemplate(): string {
    return "CREATE FUNCTION function_name() RETURNS INTEGER\nBEGIN\n  RETURN 0;\nEND;";
  }

  public triggerTemplate(table = "table_name"): string {
    return `CREATE TRIGGER trigger_name\nAFTER INSERT ON ${table}\nFOR EACH ROW\nBEGIN\nEND;`;
  }
}

export class MySqlDialect extends InformationSchemaDialect {
  public readonly id = "mysql";

  public constructor() {
    super(["MySQL", "MariaDB", "MySQLCompatible"]);
  }

  public override quoteIdentifier(identifier: string): string {
    const value = normalized(identifier);
    if (!value) {
      throw new Error("MySQL identifier cannot be empty");
    }
    return `\`${value.replaceAll("`", "``")}\``;
  }

  public override showTables(schema?: string | null): string {
    return `SELECT TABLE_NAME "name", TABLE_COMMENT "comment", TABLE_ROWS "table_rows", AUTO_INCREMENT, ROW_FORMAT, DATA_LENGTH, INDEX_LENGTH FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema))} AND TABLE_TYPE <> 'VIEW' ORDER BY TABLE_NAME;`;
  }

  public override showColumns(schema: string | null, table: string): string {
    return `SELECT COLUMN_NAME "name", DATA_TYPE "simpleType", COLUMN_TYPE "type", COLUMN_COMMENT "comment", COLUMN_KEY "key", IS_NULLABLE "nullable", CHARACTER_MAXIMUM_LENGTH "maxLength", COLUMN_DEFAULT "defaultValue", EXTRA "extra" FROM information_schema.columns WHERE TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema))} AND TABLE_NAME = ${this.escapeLiteral(table)} ORDER BY ORDINAL_POSITION;`;
  }

  public override showViews(schema?: string | null): string {
    return `SELECT TABLE_NAME "name" FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema))} ORDER BY TABLE_NAME;`;
  }

  public override showProcedures(schema?: string | null): string {
    return `SELECT ROUTINE_NAME "name" FROM information_schema.routines WHERE ROUTINE_SCHEMA = ${this.escapeLiteral(normalized(schema))} AND ROUTINE_TYPE = 'PROCEDURE' ORDER BY ROUTINE_NAME;`;
  }

  public override showFunctions(schema?: string | null): string {
    return `SELECT ROUTINE_NAME "name" FROM information_schema.routines WHERE ROUTINE_SCHEMA = ${this.escapeLiteral(normalized(schema))} AND ROUTINE_TYPE = 'FUNCTION' ORDER BY ROUTINE_NAME;`;
  }

  public override showTriggers(schema?: string | null): string {
    return `SELECT TRIGGER_NAME "name" FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ${this.escapeLiteral(normalized(schema))} ORDER BY TRIGGER_NAME;`;
  }

  public override showTableSource(schema: string | null, table: string): string {
    const qualifiedName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(table)}`
      : this.quoteIdentifier(table);
    return `SHOW CREATE TABLE ${qualifiedName};`;
  }

  public override showViewSource(schema: string | null, view: string): string {
    const qualifiedName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(view)}`
      : this.quoteIdentifier(view);
    return `SHOW CREATE VIEW ${qualifiedName};`;
  }

  public override showRoutineSource(
    kind: "procedure" | "function" | "trigger",
    schema: string | null,
    name: string,
  ): string {
    const schemaLiteral = this.escapeLiteral(normalized(schema) || "public");
    const nameLiteral = this.escapeLiteral(name);
    if (kind === "trigger") {
      return `SELECT pg_get_triggerdef(t.oid) "definition" FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ${schemaLiteral} AND t.tgname = ${nameLiteral};`;
    }
    return `SELECT pg_get_functiondef(p.oid) "definition" FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = ${schemaLiteral} AND p.proname = ${nameLiteral};`;
  }

  public override pingDatabase(schema?: string | null): string | null {
    return schema ? `USE ${this.quoteIdentifier(schema)};` : "SELECT 1;";
  }

  public override showVersion(): string {
    return "SELECT @@version AS server_version;";
  }

  public override processList(): string {
    return "SELECT ID, USER AS \"User\", DB, COMMAND AS \"Command\", STATE AS \"State\", TIME, INFO AS \"SQL\" FROM information_schema.PROCESSLIST;";
  }

  public override tableTemplate(): string {
    return "CREATE TABLE table_name (\n  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,\n  create_time DATETIME,\n  column_name VARCHAR(255)\n) DEFAULT CHARSET = utf8mb4;";
  }
}

export class PostgresDialect extends InformationSchemaDialect {
  public readonly id = "postgresql";

  public constructor() {
    super(["PostgreSQL", "Redshift", "Kingbase", "GaussDB", "Cockroach"]);
  }

  public override showTables(schema?: string | null): string {
    return `SELECT TABLE_NAME "name", TABLE_SCHEMA "schema" FROM information_schema.tables WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema))} ORDER BY TABLE_NAME;`;
  }

  public override showColumns(schema: string | null, table: string): string {
    return `SELECT COLUMN_NAME "name", DATA_TYPE "type", IS_NULLABLE "nullable", CHARACTER_MAXIMUM_LENGTH "maxLength", COLUMN_DEFAULT "defaultValue" FROM information_schema.columns WHERE TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema))} AND TABLE_NAME = ${this.escapeLiteral(table)} ORDER BY ORDINAL_POSITION;`;
  }

  public override showSchemas(): string {
    return "SELECT catalog_name \"Database\", schema_name \"schema\" FROM information_schema.schemata ORDER BY schema_name;";
  }

  public override showTableSource(): string {
    return "";
  }

  public override showViewSource(schema: string | null, view: string): string {
    return `SELECT TABLE_NAME "name", VIEW_DEFINITION "definition" FROM information_schema.views WHERE TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema))} AND TABLE_NAME = ${this.escapeLiteral(view)};`;
  }

  public override showIndex(schema: string | null, table: string): string {
    return `SELECT indexname "index_name", indexdef FROM pg_indexes WHERE schemaname = ${this.escapeLiteral(normalized(schema))} AND tablename = ${this.escapeLiteral(table)} ORDER BY indexname;`;
  }

  public override showVersion(): string {
    return "SELECT version() AS server_version;";
  }

  public override processList(): string {
    return "SELECT pid AS \"ID\", usename AS \"User\", datname AS \"DB\", state AS \"State\", query AS \"SQL\", query_start AS \"Time\" FROM pg_stat_activity ORDER BY pid;";
  }

  public override pingDatabase(schema?: string | null): string | null {
    return schema ? `SET search_path TO ${this.quoteIdentifier(schema)};` : "SELECT 1;";
  }
}

export class SqlServerDialect extends InformationSchemaDialect {
  public readonly id = "sqlserver";

  public constructor() {
    super(["SqlServer", "MSSQL"]);
  }

  public override quoteIdentifier(identifier: string): string {
    const value = normalized(identifier);
    if (!value) {
      throw new Error("SQL Server identifier cannot be empty");
    }
    return "[" + value.replaceAll("]", "]]" ) + "]";
  }

  public override buildPageSql(
    _schema: string | null,
    table: string,
    limit: number,
  ): string {
    return `SELECT TOP ${limitValue(limit)} * FROM ${table};`;
  }

  public override showTables(schema?: string | null): string {
    return `SELECT TABLE_NAME "name" FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema) || "dbo")} ORDER BY TABLE_NAME;`;
  }

  public override showColumns(schema: string | null, table: string): string {
    return `SELECT COLUMN_NAME "name", DATA_TYPE "type", IS_NULLABLE "nullable", CHARACTER_MAXIMUM_LENGTH "maxLength", COLUMN_DEFAULT "defaultValue" FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema) || "dbo")} AND TABLE_NAME = ${this.escapeLiteral(table)} ORDER BY ORDINAL_POSITION;`;
  }

  public override showVersion(): string {
    return "SELECT @@VERSION AS server_version;";
  }
}

export class SqliteDialect extends InformationSchemaDialect {
  public readonly id = "sqlite";

  public constructor() {
    super(["SQLite", "libSQL", "D1", "DuckDB"]);
  }

  public override quoteIdentifier(identifier: string): string {
    const value = normalized(identifier);
    if (!value) {
      throw new Error("SQLite identifier cannot be empty");
    }
    return `"${value.replaceAll('"', '""')}"`;
  }

  public override showTables(): string {
    return `SELECT name, type FROM sqlite_master WHERE type = 'table' AND name NOT IN ('sqlite_sequence', 'sqlite_stat1') ORDER BY name;`;
  }

  public override showColumns(_schema: string | null, table: string): string {
    return `PRAGMA table_info(${this.quoteIdentifier(table)});`;
  }

  public override showViews(): string {
    return `SELECT name, type FROM sqlite_master WHERE type = 'view' ORDER BY name;`;
  }

  public override showTableSource(_schema: string | null, table: string): string {
    return `SELECT sql AS "Create Table" FROM sqlite_master WHERE name = ${this.escapeLiteral(table)} AND type = 'table';`;
  }

  public override showViewSource(_schema: string | null, view: string): string {
    return `SELECT sql AS "Create View" FROM sqlite_master WHERE name = ${this.escapeLiteral(view)} AND type = 'view';`;
  }

  public override showDatabases(): string {
    return "SELECT 'main' AS \"Database\";";
  }

  public override showSchemas(): string {
    return this.showDatabases();
  }

  public override pingDatabase(): string | null {
    return "SELECT 1;";
  }
}

export class ClickHouseDialect extends InformationSchemaDialect {
  public readonly id = "clickhouse";

  public constructor() {
    super(["ClickHouse", "Doris"]);
  }

  public override showTables(schema?: string | null): string {
    return `SELECT name, engine AS type, comment, total_rows AS table_rows, data_length FROM system.tables WHERE database = ${this.escapeLiteral(normalized(schema))} AND engine <> 'View' ORDER BY name;`;
  }

  public override showColumns(schema: string | null, table: string): string {
    return `SELECT name, type, default_expression AS defaultValue, comment, is_in_primary_key AS \"key\" FROM system.columns WHERE database = ${this.escapeLiteral(normalized(schema))} AND table = ${this.escapeLiteral(table)} ORDER BY position;`;
  }

  public override showDatabases(): string {
    return "SELECT name AS \"Database\" FROM system.databases ORDER BY name;";
  }

  public override showSchemas(): string {
    return this.showDatabases();
  }

  public override showVersion(): string {
    return "SELECT version() AS server_version;";
  }
}

export class CommonSqlDialect extends InformationSchemaDialect {
  public readonly id = "common";

  public constructor() {
    super([]);
  }

  public override supports(type: DatabaseType): boolean {
    return !noSqlTypes.has(type);
  }
}

export function createStandardDialects(): Dialect[] {
  return [
    new OracleDialect(),
    new MySqlDialect(),
    new PostgresDialect(),
    new SqlServerDialect(),
    new SqliteDialect(),
    new ClickHouseDialect(),
    new CommonSqlDialect(),
  ];
}
