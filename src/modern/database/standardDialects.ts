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

function processId(process: Record<string, unknown>): number | undefined {
  const value = process.ID ?? process.Id ?? process.id ?? process.pid ?? process.Process;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
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

  public showMaterialViews(schema?: string | null): string {
    return `SELECT TABLE_NAME "name" FROM information_schema.TABLES WHERE ${schemaFilter(schema)} AND TABLE_TYPE = 'MATERIALIZED VIEW' ORDER BY TABLE_NAME;`;
  }

  public showSequences(schema?: string | null): string {
    return `SELECT SEQUENCE_NAME "name" FROM information_schema.SEQUENCES WHERE ${schemaFilter(schema)} ORDER BY SEQUENCE_NAME;`;
  }

  public showCustomTypes(schema?: string | null): string {
    return `SELECT USER_DEFINED_TYPE_NAME "name", USER_DEFINED_TYPE_CATEGORY "type" FROM information_schema.USER_DEFINED_TYPES WHERE ${schemaFilter(schema)} ORDER BY USER_DEFINED_TYPE_NAME;`;
  }

  public showExternalTables(schema?: string | null): string {
    return `SELECT FOREIGN_TABLE_NAME "name", FOREIGN_SERVER_NAME "server", FOREIGN_SERVER_CATALOG "server_db" FROM information_schema.FOREIGN_TABLES WHERE ${schemaFilter(schema)} ORDER BY FOREIGN_TABLE_NAME;`;
  }

  public showDatabases(): string {
    return "SELECT SCHEMA_NAME AS \"Database\" FROM information_schema.schemata ORDER BY SCHEMA_NAME;";
  }

  public showSchemas(): string {
    return this.showDatabases();
  }

  public createDatabase(): string {
    return "CREATE DATABASE database_name;";
  }

  public showTableSource(schema: string | null, table: string): string {
    return `SHOW CREATE TABLE ${schema ? `${this.quoteIdentifier(schema)}.` : ""}${this.quoteIdentifier(table)};`;
  }

  public showViewSource(schema: string | null, view: string): string {
    return `SHOW CREATE VIEW ${schema ? `${this.quoteIdentifier(schema)}.` : ""}${this.quoteIdentifier(view)};`;
  }

  public showPartitions(schema: string | null, table: string): string {
    return `SELECT PARTITION_NAME "name", PARTITION_METHOD "strategy", PARTITION_EXPRESSION "columnName", PARTITION_DESCRIPTION "value", TABLE_ROWS "rows", DATA_LENGTH "length" FROM information_schema.PARTITIONS WHERE TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema))} AND TABLE_NAME = ${this.escapeLiteral(table)} AND PARTITION_NAME IS NOT NULL;`;
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
    return "";
  }

  public kill(_process: Record<string, unknown>): string | null {
    return null;
  }

  public showIndex(schema: string | null, table: string): string {
    return `SELECT * FROM information_schema.statistics WHERE TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema))} AND TABLE_NAME = ${this.escapeLiteral(table)} ORDER BY INDEX_NAME;`;
  }

  public showForeignKeys(schema: string | null, table?: string): string {
    const tableFilter = table
      ? ` AND TABLE_NAME = ${this.escapeLiteral(table)}`
      : "";
    return `SELECT TABLE_NAME "table_name", COLUMN_NAME "column_name", REFERENCED_TABLE_NAME "referenced_table", REFERENCED_COLUMN_NAME "referenced_column", CONSTRAINT_NAME "constraint_name", ORDINAL_POSITION "ordinal_position" FROM information_schema.KEY_COLUMN_USAGE WHERE ${schemaFilter(schema)} AND REFERENCED_TABLE_NAME IS NOT NULL${tableFilter} ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;`;
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

  public showEvents(schema?: string | null): string {
    return `SELECT EVENT_NAME "name" FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ${this.escapeLiteral(normalized(schema))} ORDER BY EVENT_NAME;`;
  }

  public showEventSource(schema: string | null, name: string): string {
    const qualifiedName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(name)}`
      : this.quoteIdentifier(name);
    return `SHOW CREATE EVENT ${qualifiedName};`;
  }

  public eventTemplate(): string {
    return "CREATE EVENT event_name\nON SCHEDULE AT CURRENT_TIMESTAMP + INTERVAL 1 HOUR\nDO\nBEGIN\n  SELECT NOW();\nEND;";
  }

  public override createDatabase(): string {
    return "CREATE DATABASE database_name DEFAULT CHARACTER SET = 'utf8mb4';";
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
    const qualifiedName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(name)}`
      : this.quoteIdentifier(name);
    return `SHOW CREATE ${kind.toUpperCase()} ${qualifiedName};`;
  }

  public override pingDatabase(schema?: string | null): string | null {
    return schema ? `USE ${this.quoteIdentifier(schema)};` : "SELECT 1;";
  }

  public override showVersion(): string {
    return "SELECT @@version AS server_version;";
  }

  public truncateDatabase(database: string): string {
    const schema = this.escapeLiteral(normalized(database));
    return `SELECT CONCAT('TRUNCATE TABLE \`', REPLACE(TABLE_SCHEMA, '\`', '\`\`'), '\`.\`', REPLACE(TABLE_NAME, '\`', '\`\`'), '\`;') AS trun FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ${schema} AND TABLE_TYPE <> 'VIEW';`;
  }

  public dropDatabase(database: string): string {
    return `DROP DATABASE ${this.quoteIdentifier(database)};`;
  }

  public override processList(): string {
    return "SELECT ID, USER AS \"User\", DB, COMMAND AS \"Command\", STATE AS \"State\", TIME, INFO AS \"SQL\" FROM information_schema.PROCESSLIST;";
  }

  public override kill(process: Record<string, unknown>): string | null {
    const id = processId(process);
    return id ? `KILL ${id};` : null;
  }

  public override tableTemplate(): string {
    return "CREATE TABLE table_name (\n  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,\n  create_time DATETIME,\n  column_name VARCHAR(255)\n) DEFAULT CHARSET = utf8mb4;";
  }

  public showUsers(): string {
    return "SELECT user AS \"user\", host AS \"host\" FROM mysql.user ORDER BY user, host;";
  }

  public createUser(): string {
    return "CREATE USER 'username'@'%' IDENTIFIED BY 'password';\nGRANT SELECT ON *.* TO 'username'@'%';\nGRANT ALL PRIVILEGES ON *.* TO 'username'@'%';";
  }

  public updateUser(username: string, host?: string | null): string {
    return `ALTER USER ${this.escapeLiteral(username)}@${this.escapeLiteral(host || "%")} IDENTIFIED BY 'newPassword';`;
  }
}

export class PostgresDialect extends InformationSchemaDialect {
  public readonly id = "postgresql";

  public constructor() {
    super(["PostgreSQL", "Redshift", "Kingbase", "GaussDB", "Cockroach", "PostgreCompatible"]);
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

  public override createDatabase(): string {
    return "CREATE DATABASE database_name;";
  }

  public override showTableSource(): string {
    return "";
  }

  public override showMaterialViews(schema?: string | null): string {
    return `SELECT matviewname "name" FROM pg_catalog.pg_matviews WHERE schemaname = ${this.escapeLiteral(normalized(schema))} ORDER BY matviewname;`;
  }

  public override showSequences(schema?: string | null): string {
    return `SELECT sequencename "name", last_value "sequence", increment_by "increment" FROM pg_catalog.pg_sequences WHERE schemaname = ${this.escapeLiteral(normalized(schema))} ORDER BY sequencename;`;
  }

  public override showCustomTypes(schema?: string | null): string {
    return `SELECT t.typname "name", t.typtype "type", string_agg(e.enumlabel, ',') "enum_values" FROM pg_catalog.pg_type t LEFT JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid LEFT JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE (t.typrelid = 0 OR (SELECT c.relkind = 'c' FROM pg_catalog.pg_class c WHERE c.oid = t.typrelid)) AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type element WHERE element.oid = t.typelem AND element.typarray = t.oid) AND n.nspname = ${this.escapeLiteral(normalized(schema))} GROUP BY t.typname, t.typtype ORDER BY t.typname;`;
  }

  public override showExternalTables(schema?: string | null): string {
    return `SELECT foreign_table_name "name", foreign_server_name "server", foreign_server_catalog "server_db" FROM information_schema.foreign_tables WHERE foreign_table_schema = ${this.escapeLiteral(normalized(schema))} ORDER BY foreign_table_name;`;
  }

  public override showPartitions(schema: string | null, table: string): string {
    return `SELECT col.column_name "columnName", pt.partition_strategy "strategy" FROM (SELECT partrelid, partstrat, unnest(partattrs) column_index, CASE partstrat WHEN 'h' THEN 'HASH' WHEN 'l' THEN 'LIST' WHEN 'r' THEN 'RANGE' END partition_strategy FROM pg_catalog.pg_partitioned_table) pt JOIN pg_catalog.pg_class pc ON pc.oid = pt.partrelid JOIN pg_catalog.pg_namespace pn ON pn.oid = pc.relnamespace JOIN information_schema.columns col ON col.table_schema = pn.nspname AND col.table_name = pc.relname AND col.ordinal_position = pt.column_index WHERE pn.nspname = ${this.escapeLiteral(normalized(schema))} AND pc.relname = ${this.escapeLiteral(table)};`;
  }

  public override showViewSource(schema: string | null, view: string): string {
    return `SELECT TABLE_NAME "name", VIEW_DEFINITION "definition" FROM information_schema.views WHERE TABLE_SCHEMA = ${this.escapeLiteral(normalized(schema))} AND TABLE_NAME = ${this.escapeLiteral(view)};`;
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

  public override showIndex(schema: string | null, table: string): string {
    return `SELECT indexname "index_name", indexdef FROM pg_indexes WHERE schemaname = ${this.escapeLiteral(normalized(schema))} AND tablename = ${this.escapeLiteral(table)} ORDER BY indexname;`;
  }

  public override showForeignKeys(schema: string | null, table?: string): string {
    const tableFilter = table
      ? ` AND kcu.table_name = ${this.escapeLiteral(table)}`
      : "";
    const schemaLiteral = this.escapeLiteral(normalized(schema));
    return `SELECT kcu.table_name "table_name", kcu.column_name "column_name", ccu.table_name "referenced_table", ccu.column_name "referenced_column", tc.constraint_name "constraint_name", kcu.ordinal_position "ordinal_position" FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_catalog = kcu.constraint_catalog AND tc.constraint_schema = kcu.constraint_schema AND tc.constraint_name = kcu.constraint_name AND tc.table_name = kcu.table_name JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_catalog = tc.constraint_catalog AND ccu.constraint_schema = tc.constraint_schema AND ccu.constraint_name = tc.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = ${schemaLiteral}${tableFilter} ORDER BY kcu.table_name, tc.constraint_name, kcu.ordinal_position;`;
  }

  public override showVersion(): string {
    return "SELECT version() AS server_version;";
  }

  public showUsers(): string {
    return "SELECT usename AS \"user\" FROM pg_user ORDER BY usename;";
  }

  public createUser(): string {
    return "CREATE USER \"username\" WITH PASSWORD 'password';\nGRANT SELECT ON ALL TABLES IN SCHEMA \"public\" TO \"username\";";
  }

  public updateUser(username: string): string {
    return `ALTER USER ${this.quoteIdentifier(username)} WITH PASSWORD 'newPassword';`;
  }

  public showRoles(): string {
    return "SELECT rolname AS \"role\" FROM pg_roles ORDER BY rolname;";
  }

  public createRole(): string {
    return "CREATE ROLE role_name;\nGRANT role_name TO username;";
  }

  public updateRole(role: string): string {
    return `ALTER ROLE ${this.quoteIdentifier(role)};`;
  }

  public dropRole(role: string): string {
    return `DROP ROLE ${this.quoteIdentifier(role)};`;
  }

  public grantRole(role: string): string {
    return `GRANT ${this.quoteIdentifier(role)} TO username;`;
  }

  public truncateDatabase(database: string): string {
    return `SELECT 'TRUNCATE TABLE ' || quote_ident(table_schema) || '.' || quote_ident(table_name) || ';' AS trun FROM information_schema.tables WHERE table_schema = ${this.escapeLiteral(normalized(database))} AND table_type = 'BASE TABLE';`;
  }

  public dropDatabase(database: string): string {
    return `DROP SCHEMA ${this.quoteIdentifier(database)};`;
  }

  public override processList(): string {
    return "SELECT pid AS \"ID\", usename AS \"User\", datname AS \"DB\", state AS \"State\", query AS \"SQL\", query_start AS \"Time\" FROM pg_stat_activity ORDER BY pid;";
  }

  public override kill(process: Record<string, unknown>): string | null {
    const id = processId(process);
    return id ? `SELECT pg_terminate_backend(${id});` : null;
  }

  public override pingDatabase(schema?: string | null): string | null {
    return schema ? `SET search_path TO ${this.quoteIdentifier(schema)};` : "SELECT 1;";
  }
}

export class SqlServerDialect extends InformationSchemaDialect {
  public readonly id = "sqlserver";

  public constructor() {
    super(["SqlServer", "AzureSQLServer", "MSSQL"]);
  }

  public override quoteIdentifier(identifier: string): string {
    const value = normalized(identifier);
    if (!value) {
      throw new Error("SQL Server identifier cannot be empty");
    }
    return "[" + value.replaceAll("]", "]]") + "]";
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

  public override showForeignKeys(schema: string | null, table?: string): string {
    const schemaLiteral = this.escapeLiteral(normalized(schema) || "dbo");
    const tableFilter = table
      ? ` AND kcu.TABLE_NAME = ${this.escapeLiteral(table)}`
      : "";
    return `SELECT kcu.TABLE_NAME "table_name", kcu.COLUMN_NAME "column_name", ccu.TABLE_NAME "referenced_table", ccu.COLUMN_NAME "referenced_column", tc.CONSTRAINT_NAME "constraint_name", kcu.ORDINAL_POSITION "ordinal_position" FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_NAME = kcu.TABLE_NAME JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc ON rc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu ON ccu.CONSTRAINT_SCHEMA = rc.UNIQUE_CONSTRAINT_SCHEMA AND ccu.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY' AND tc.TABLE_SCHEMA = ${schemaLiteral}${tableFilter} ORDER BY kcu.TABLE_NAME, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION;`;
  }

  public override showVersion(): string {
    return "SELECT @@VERSION AS server_version;";
  }

  public showUsers(): string {
    return "SELECT name AS \"user\" FROM sys.database_principals WHERE type = 'S' ORDER BY name;";
  }

  public createUser(): string {
    return "CREATE LOGIN [login_name] WITH PASSWORD = 'password';\nCREATE USER [user_name] FOR LOGIN [login_name];";
  }

  public showLogins(): string {
    return "SELECT name AS \"login\" FROM sys.server_principals WHERE type IN ('S', 'U', 'G', 'E') ORDER BY name;";
  }

  public showRoles(): string {
    return "SELECT name AS \"role\" FROM sys.server_principals WHERE type = 'R' ORDER BY name;";
  }

  public showDatabaseUsers(): string {
    return "SELECT name AS \"user\" FROM sys.database_principals WHERE type IN ('S', 'U', 'G', 'E') ORDER BY name;";
  }

  public showDatabaseRoles(): string {
    return "SELECT name AS \"role\" FROM sys.database_principals WHERE type = 'R' ORDER BY name;";
  }

  public createRole(): string {
    return "CREATE ROLE role_name;\nALTER ROLE role_name ADD MEMBER user_name;";
  }

  public updateRole(role: string): string {
    return `ALTER ROLE ${this.quoteIdentifier(role)};`;
  }

  public dropRole(role: string): string {
    return `DROP ROLE ${this.quoteIdentifier(role)};`;
  }

  public grantRole(role: string): string {
    return `ALTER ROLE ${this.quoteIdentifier(role)} ADD MEMBER user_name;`;
  }

  public createLogin(): string {
    return "CREATE LOGIN [login_name] WITH PASSWORD = 'password';";
  }

  public updateLogin(login: string): string {
    return `ALTER LOGIN ${this.quoteIdentifier(login)} WITH PASSWORD = 'newPassword';`;
  }

  public dropLogin(login: string): string {
    return `DROP LOGIN ${this.quoteIdentifier(login)};`;
  }

  public truncateDatabase(database: string): string {
    return `SELECT CONCAT('TRUNCATE TABLE ', QUOTENAME(TABLE_SCHEMA), '.', QUOTENAME(TABLE_NAME), ';') AS trun FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = ${this.escapeLiteral(normalized(database))};`;
  }

  public dropDatabase(database: string): string {
    return `DROP SCHEMA ${this.quoteIdentifier(database)};`;
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

  public override showForeignKeys(_schema: string | null, table?: string): string {
    return table ? `PRAGMA foreign_key_list(${this.quoteIdentifier(table)});` : "";
  }

  public override showViews(): string {
    return `SELECT name, type FROM sqlite_master WHERE type = 'view' ORDER BY name;`;
  }

  public override showTriggers(_schema?: string | null, table?: string | null): string {
    const tableFilter = table ? ` AND tbl_name = ${this.escapeLiteral(table)}` : "";
    return `SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'${tableFilter} ORDER BY name;`;
  }

  public override showSequences(): string {
    return "SELECT name, seq AS sequence FROM sqlite_sequence ORDER BY name;";
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

  public override showForeignKeys(): string {
    return "";
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

  public override showForeignKeys(): string {
    return "";
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
