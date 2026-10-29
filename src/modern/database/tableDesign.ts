import type { DatabaseType, Dialect } from "./types";

export interface TableDesignColumn extends Record<string, unknown> {
  readonly name: string;
  readonly type?: string;
  readonly simpleType?: string;
  readonly nullable?: string | boolean;
  readonly isNotNull?: boolean;
  readonly defaultValue?: unknown;
  readonly comment?: string;
  readonly key?: string;
  readonly extra?: string;
}

export interface TableDesignIndex extends Record<string, unknown> {
  readonly name?: string;
  readonly indexName?: string;
  readonly columnName?: string;
  readonly columns?: readonly string[];
  readonly isUnique?: boolean | string | number;
}

export interface TableDesignForeignKey extends Record<string, unknown> {
  readonly constraintName?: string;
  readonly columnName?: string;
  readonly referencedTable?: string;
  readonly referencedColumn?: string;
  readonly updateRule?: string;
  readonly deleteRule?: string;
}

export interface TableDesignMetadata {
  readonly table: string;
  readonly schema: string | null;
  readonly dbType: DatabaseType;
  readonly engine?: string;
  readonly comment?: string;
  readonly collation?: string;
  readonly columns: readonly TableDesignColumn[];
  readonly primaryKey?: string;
  readonly indexes: readonly TableDesignIndex[];
  readonly foreignKeys: readonly TableDesignForeignKey[];
  readonly checks: readonly Record<string, unknown>[];
  readonly triggers: readonly Record<string, unknown>[];
  readonly ddl?: string;
  readonly isSupportCheck: boolean;
  readonly supportForeignKey: boolean;
  readonly supportIndex: boolean;
  readonly supportTrigger: boolean;
  readonly canAlterTable: boolean;
}

export interface UpdateTableDesignInput {
  readonly table: string;
  readonly schema?: string | null;
  readonly dbType?: DatabaseType;
  readonly newTableName?: string;
  readonly comment?: string | null;
  readonly newComment?: string | null;
  readonly collation?: string | null;
  readonly newCollation?: string | null;
}

export interface UpdateColumnDesignInput extends Record<string, unknown> {
  readonly table: string;
  readonly schema?: string | null;
  readonly dbType?: DatabaseType;
  readonly columnName?: string;
  readonly newColumnName?: string;
  readonly name?: string;
  readonly type?: string;
  readonly columnType?: string;
  readonly isNotNull?: boolean;
  readonly nullable?: string | boolean;
  readonly defaultValue?: unknown;
  readonly comment?: string | null;
  readonly oldRow?: Record<string, unknown>;
  readonly isNew?: boolean;
  readonly unsigned?: boolean;
  readonly zerofill?: boolean;
}

export interface CreateIndexDesignInput {
  readonly table: string;
  readonly schema?: string | null;
  readonly dbType?: DatabaseType;
  readonly name?: string;
  readonly columns?: readonly string[];
  readonly column?: string;
  readonly type?: string;
  readonly indexType?: string;
  readonly unique?: boolean;
}

export interface CreateForeignKeyDesignInput {
  readonly table: string;
  readonly schema?: string | null;
  readonly dbType?: DatabaseType;
  readonly name?: string;
  readonly column?: string;
  readonly refTable?: string;
  readonly refColumn?: string;
  readonly updateRule?: string;
  readonly deleteRule?: string;
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function requiredText(value: unknown, label: string): string {
  const result = text(value);
  if (!result) {
    throw new Error(`${label} is required`);
  }
  return result;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function rowValue(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
    const matching = Object.keys(row).find(
      (key) => key.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (matching) return row[matching];
  }
  return undefined;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "true", "yes", "y", "pri", "primary"].includes(text(value).toLowerCase());
}

function mysqlFamily(dbType: DatabaseType): boolean {
  return ["MySQL", "MariaDB", "MySQLCompatible", "Doris"].includes(dbType);
}

function postgresFamily(dbType: DatabaseType): boolean {
  return ["PostgreSQL", "Redshift", "Kingbase", "GaussDB", "Cockroach", "PostgreCompatible"].includes(dbType);
}

function sqlServerFamily(dbType: DatabaseType): boolean {
  return ["SqlServer", "AzureSQLServer"].includes(dbType);
}

function oracleFamily(dbType: DatabaseType): boolean {
  return dbType === "Oracle";
}

function tableName(dialect: Dialect, schema: string | null | undefined, table: string): string {
  const qualified = requiredText(table, "Table name");
  return schema && text(schema)
    ? `${dialect.quoteIdentifier(text(schema))}.${dialect.quoteIdentifier(qualified)}`
    : dialect.quoteIdentifier(qualified);
}

function columnName(dialect: Dialect, value: unknown, label = "Column name"): string {
  return dialect.quoteIdentifier(requiredText(value, label));
}

function defaultExpression(dialect: Dialect, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const raw = text(value);
  if (!raw) return undefined;
  if (/^(CURRENT_(?:TIMESTAMP|DATE|TIME)(?:\(\d+\))?|NULL)$/i.test(raw) || /^\(.+\)$/.test(raw)) {
    return raw;
  }
  return dialect.escapeLiteral(raw);
}

function nullability(input: UpdateColumnDesignInput, oldRow: Record<string, unknown>): string {
  const explicit = input.isNotNull;
  const current = explicit === undefined
    ? input.nullable === undefined
      ? booleanValue(rowValue(oldRow, "isNotNull", "notNull", "NOT_NULL"))
      : !["yes", "true", "1"].includes(text(input.nullable).toLowerCase())
    : explicit;
  return current ? " NOT NULL" : " NULL";
}

function defaultClause(
  dialect: Dialect,
  input: UpdateColumnDesignInput,
  oldRow: Record<string, unknown>,
): string {
  const value = input.defaultValue === undefined
    ? rowValue(oldRow, "defaultValue", "column_default", "COLUMN_DEFAULT")
    : input.defaultValue;
  const expression = defaultExpression(dialect, value);
  return expression ? ` DEFAULT ${expression}` : "";
}

export function normalizeDesignColumn(value: unknown): TableDesignColumn {
  const source = record(value);
  const name = text(rowValue(source, "name", "column_name", "COLUMN_NAME"));
  const nullable = rowValue(source, "nullable", "is_nullable", "IS_NULLABLE");
  return {
    ...source,
    name,
    type: text(rowValue(source, "type", "column_type", "COLUMN_TYPE", "data_type", "DATA_TYPE")) || undefined,
    simpleType: text(rowValue(source, "simpleType", "data_type", "DATA_TYPE")) || undefined,
    nullable: typeof nullable === "string" || typeof nullable === "boolean" ? nullable : undefined,
    isNotNull: source.isNotNull === undefined
      ? ["no", "false", "0"].includes(text(rowValue(source, "nullable", "is_nullable", "IS_NULLABLE")).toLowerCase())
      : booleanValue(source.isNotNull),
    defaultValue: rowValue(source, "defaultValue", "column_default", "COLUMN_DEFAULT"),
    comment: text(rowValue(source, "comment", "COLUMN_COMMENT")) || undefined,
    key: text(rowValue(source, "key", "COLUMN_KEY")) || undefined,
    extra: text(rowValue(source, "extra", "EXTRA")) || undefined,
  };
}

export function buildUpdateTableSql(
  dialect: Dialect,
  input: UpdateTableDesignInput,
): string {
  const dbType = input.dbType || "MySQL";
  const currentTable = requiredText(input.table, "Table name");
  const statements: string[] = [];
  const currentComment = input.comment == null ? "" : text(input.comment);
  const nextComment = input.newComment == null ? "" : text(input.newComment);
  const currentCollation = text(input.collation);
  const nextCollation = text(input.newCollation);
  const qualified = tableName(dialect, input.schema, currentTable);

  if (input.newTableName && text(input.newTableName) !== currentTable) {
    statements.push(`ALTER TABLE ${qualified} RENAME TO ${dialect.quoteIdentifier(text(input.newTableName))};`);
  }
  if (nextComment !== currentComment) {
    if (mysqlFamily(dbType)) {
      statements.push(`ALTER TABLE ${qualified} COMMENT = ${dialect.escapeLiteral(nextComment)};`);
    } else {
      statements.push(`COMMENT ON TABLE ${qualified} IS ${dialect.escapeLiteral(nextComment)};`);
    }
  }
  if (nextCollation && nextCollation !== currentCollation && mysqlFamily(dbType)) {
    statements.push(`ALTER TABLE ${qualified} COLLATE = ${dialect.quoteIdentifier(nextCollation)};`);
  }
  return statements.join("\n");
}

export function buildUpdateColumnSql(
  dialect: Dialect,
  input: UpdateColumnDesignInput,
): string | undefined {
  const dbType = input.dbType || "MySQL";
  const table = tableName(dialect, input.schema, input.table);
  const oldRow = record(input.oldRow);
  const oldName = text(input.columnName || rowValue(oldRow, "name", "column_name", "COLUMN_NAME"));
  const nextName = text(input.newColumnName || input.name || oldName);
  const type = text(input.columnType || input.type || rowValue(oldRow, "type", "column_type", "COLUMN_TYPE", "data_type", "DATA_TYPE"));
  if (!nextName || !type) return undefined;
  const quotedNextName = columnName(dialect, nextName);
  const nextDefault = defaultClause(dialect, input, oldRow);
  const nextNullability = nullability(input, oldRow);
  const comment = input.comment == null ? "" : text(input.comment);
  const commentClause = comment ? ` COMMENT ${dialect.escapeLiteral(comment)}` : "";
  const unsigned = input.unsigned ? " UNSIGNED" : "";
  const zerofill = input.zerofill ? " ZEROFILL" : "";

  if (input.isNew) {
    if (["SQLite", "libSQL"].includes(dbType)) {
      return `ALTER TABLE ${table} ADD COLUMN ${quotedNextName} ${type}${nextNullability}${nextDefault};`;
    }
    return `ALTER TABLE ${table} ADD COLUMN ${quotedNextName} ${type}${unsigned}${zerofill}${nextNullability}${nextDefault}${commentClause};`;
  }
  if (!oldName) return undefined;
  const quotedOldName = columnName(dialect, oldName);
  if (["SQLite", "libSQL"].includes(dbType)) {
    return undefined;
  }
  if (mysqlFamily(dbType)) {
    return `ALTER TABLE ${table} CHANGE ${quotedOldName} ${quotedNextName} ${type}${unsigned}${zerofill}${nextNullability}${nextDefault}${commentClause};`;
  }
  if (postgresFamily(dbType)) {
    const statements: string[] = [];
    const oldType = text(rowValue(oldRow, "type", "column_type", "COLUMN_TYPE", "data_type", "DATA_TYPE"));
    if (type !== oldType) statements.push(`ALTER TABLE ${table} ALTER COLUMN ${quotedOldName} TYPE ${type};`);
    if (nextName !== oldName) statements.push(`ALTER TABLE ${table} RENAME COLUMN ${quotedOldName} TO ${quotedNextName};`);
    statements.push(`ALTER TABLE ${table} ALTER COLUMN ${quotedNextName} ${nextNullability.trim() === "NOT NULL" ? "SET NOT NULL" : "DROP NOT NULL"};`);
    if (nextDefault) statements.push(`ALTER TABLE ${table} ALTER COLUMN ${quotedNextName} SET${nextDefault};`);
    if (comment || rowValue(oldRow, "comment", "COLUMN_COMMENT")) {
      statements.push(`COMMENT ON COLUMN ${table}.${quotedNextName} IS ${dialect.escapeLiteral(comment)};`);
    }
    return statements.join("\n");
  }
  if (sqlServerFamily(dbType)) {
    const statements = [`ALTER TABLE ${table} ALTER COLUMN ${quotedOldName} ${type}${nextNullability};`];
    if (nextName !== oldName) {
      statements.push(`EXEC sp_rename ${dialect.escapeLiteral(`${input.schema ? `${input.schema}.` : ""}${input.table}.${oldName}`)}, ${dialect.escapeLiteral(nextName)}, 'COLUMN';`);
    }
    return statements.join("\n");
  }
  if (oracleFamily(dbType)) {
    const statements = [`ALTER TABLE ${table} MODIFY (${quotedOldName} ${type}${nextNullability}${nextDefault});`];
    if (nextName !== oldName) statements.push(`ALTER TABLE ${table} RENAME COLUMN ${quotedOldName} TO ${quotedNextName};`);
    if (comment || rowValue(oldRow, "comment", "COLUMN_COMMENT")) {
      statements.push(`COMMENT ON COLUMN ${table}.${quotedNextName} IS ${dialect.escapeLiteral(comment)};`);
    }
    return statements.join("\n");
  }
  return `ALTER TABLE ${table} ALTER COLUMN ${quotedOldName} TYPE ${type}${nextNullability}${nextDefault};`;
}

export function buildCreateIndexSql(
  dialect: Dialect,
  input: CreateIndexDesignInput,
): string {
  const table = tableName(dialect, input.schema, input.table);
  const columns = [...(input.columns || []), input.column || ""]
    .map((value) => text(value))
    .filter(Boolean);
  if (columns.length === 0) throw new Error("At least one index column is required");
  const indexName = text(input.name) || `${input.table}_${columns.join("_")}_idx`;
  const type = text(input.type || input.indexType).toUpperCase();
  const columnList = columns.map((value) => columnName(dialect, value)).join(", ");
  const unique = input.unique || type === "UNIQUE";
  const indexType = type === "UNIQUE" ? "" : type;
  if (mysqlFamily(input.dbType || "")) {
    const mysqlPrefix = indexType === "FULLTEXT" || indexType === "SPATIAL"
      ? `CREATE ${indexType} INDEX`
      : unique ? "CREATE UNIQUE INDEX" : "CREATE INDEX";
    const using = ["BTREE", "HASH"].includes(indexType)
      ? ` USING ${indexType}`
      : "";
    return `${mysqlPrefix} ${dialect.quoteIdentifier(indexName)}${using} ON ${table} (${columnList});`;
  }
  if (postgresFamily(input.dbType || "")) {
    const using = ["BTREE", "HASH", "GIN", "GIST", "BRIN", "SPGIST"].includes(indexType)
      ? ` USING ${indexType.toLowerCase()}`
      : "";
    return `CREATE${unique ? " UNIQUE" : ""} INDEX ${dialect.quoteIdentifier(indexName)} ON ${table}${using} (${columnList});`;
  }
  if (oracleFamily(input.dbType || "")) {
    return `CREATE${unique ? " UNIQUE" : ""} INDEX ${dialect.quoteIdentifier(indexName)} ON ${table} (${columnList});`;
  }
  return `${unique ? "CREATE UNIQUE INDEX" : "CREATE INDEX"} ${dialect.quoteIdentifier(indexName)} ON ${table} (${columnList});`;
}

export function buildDropIndexSql(
  dialect: Dialect,
  dbType: DatabaseType,
  table: string,
  schema: string | null | undefined,
  indexName: string,
): string {
  const index = dialect.quoteIdentifier(requiredText(indexName, "Index name"));
  if (mysqlFamily(dbType)) return `DROP INDEX ${index} ON ${tableName(dialect, schema, table)};`;
  return `DROP INDEX ${schema && text(schema) ? `${dialect.quoteIdentifier(text(schema))}.` : ""}${index};`;
}

export function buildDropColumnSql(
  dialect: Dialect,
  dbType: DatabaseType,
  table: string,
  schema: string | null | undefined,
  columnNameValue: string,
): string | undefined {
  if (["SQLite", "libSQL"].includes(dbType)) return undefined;
  return `ALTER TABLE ${tableName(dialect, schema, table)} DROP COLUMN ${columnName(dialect, columnNameValue)};`;
}

export function buildCreateForeignKeySql(
  dialect: Dialect,
  input: CreateForeignKeyDesignInput,
): string {
  const table = tableName(dialect, input.schema, input.table);
  const name = text(input.name) || `${input.table}_${input.column || "column"}_fk`;
  const column = columnName(dialect, input.column, "Foreign-key column");
  const refTable = columnName(dialect, input.refTable, "Referenced table");
  const refColumn = columnName(dialect, input.refColumn, "Referenced column");
  const action = (value: unknown): string => {
    const normalized = text(value).toUpperCase();
    return ["RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT", "NO ACTION"].includes(normalized)
      ? ` ${normalized}`
      : "";
  };
  const deleteRule = action(input.deleteRule) || " NO ACTION";
  if (input.dbType === "Oracle") {
    const normalizedDeleteRule = text(input.deleteRule).toUpperCase();
    const oracleDelete = ["CASCADE", "SET NULL"].includes(normalizedDeleteRule)
      ? ` ON DELETE ${normalizedDeleteRule}`
      : "";
    return `ALTER TABLE ${table} ADD CONSTRAINT ${dialect.quoteIdentifier(name)} FOREIGN KEY (${column}) REFERENCES ${refTable} (${refColumn})${oracleDelete};`;
  }
  return `ALTER TABLE ${table} ADD CONSTRAINT ${dialect.quoteIdentifier(name)} FOREIGN KEY (${column}) REFERENCES ${refTable} (${refColumn}) ON UPDATE${action(input.updateRule) || " NO ACTION"} ON DELETE${deleteRule};`;
}

export function buildDropForeignKeySql(
  dialect: Dialect,
  dbType: DatabaseType,
  table: string,
  schema: string | null | undefined,
  constraintName: string,
): string | undefined {
  if (["SQLite", "libSQL"].includes(dbType)) return undefined;
  const constraint = dialect.quoteIdentifier(requiredText(constraintName, "Foreign-key name"));
  return `ALTER TABLE ${tableName(dialect, schema, table)} DROP ${mysqlFamily(dbType) ? "FOREIGN KEY" : "CONSTRAINT"} ${constraint};`;
}

export function buildDropCheckSql(
  dialect: Dialect,
  dbType: DatabaseType,
  table: string,
  schema: string | null | undefined,
  constraintName: string,
): string | undefined {
  if (["SQLite", "libSQL"].includes(dbType)) return undefined;
  const constraint = dialect.quoteIdentifier(requiredText(constraintName, "Check name"));
  return `ALTER TABLE ${tableName(dialect, schema, table)} DROP CONSTRAINT ${constraint};`;
}

export function buildDropTriggerSql(
  dialect: Dialect,
  dbType: DatabaseType,
  table: string,
  schema: string | null | undefined,
  triggerName: string,
): string {
  const trigger = dialect.quoteIdentifier(requiredText(triggerName, "Trigger name"));
  if (postgresFamily(dbType)) return `DROP TRIGGER ${trigger} ON ${tableName(dialect, schema, table)};`;
  return `DROP TRIGGER ${trigger};`;
}

export function buildCheckSql(
  dialect: Dialect,
  schema: string | null | undefined,
  table: string,
  clause: string,
): string {
  const expression = requiredText(clause, "Check expression");
  return `ALTER TABLE ${tableName(dialect, schema, table)} ADD CHECK (${expression});`;
}
