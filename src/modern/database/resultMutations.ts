import type { DatabaseType, Dialect, QueryField } from "./types";
import { resultBinaryBase64, resultValueOrigin } from "./resultValues";
export type { ResultBinaryValue } from "./resultValues";

export interface ResultMutationContext {
  readonly dbType: DatabaseType;
  readonly dialect?: Dialect;
  readonly database?: string | null;
  readonly schema?: string | null;
  readonly table?: string;
  readonly fields: readonly QueryField[];
  readonly columnList?: readonly QueryField[];
  readonly primaryKey?: string;
  readonly primaryKeyList?: readonly QueryField[];
}

export interface ResultRowUpdate {
  readonly current: Record<string, unknown>;
  readonly original?: Record<string, unknown>;
}

export type ResultImportMode = "insert" | "upsert";

export interface ResultImportOptions {
  readonly mode?: ResultImportMode;
  readonly skipPrimaryKey?: boolean;
}

export interface ResultMutationRequest {
  readonly updates?: readonly ResultRowUpdate[];
  readonly inserts?: readonly Record<string, unknown>[];
  readonly deletes?: readonly Record<string, unknown>[];
}

function fieldName(field: QueryField): string {
  return String(field.name || field.columnName || "");
}

function fieldsOf(context: ResultMutationContext): readonly QueryField[] {
  return context.columnList && context.columnList.length > 0
    ? context.columnList
    : context.fields;
}

function fieldType(field: QueryField): string {
  return String(field.simpleType || field.type || "").trim();
}

function canUseAsFallbackPredicate(field: QueryField): boolean {
  const type = fieldType(field);
  if (!type) return true;
  return !/(LOB|BYTE|BINARY|TIMESTAMP|GEO|POINT|LINESTRING|POLYGON|STRUCT)/i.test(type)
    && !/(JSON|TIME|ARRAY)/i.test(type);
}

function valueOrigin(value: unknown): unknown {
  return resultValueOrigin(value);
}

function binaryHex(value: unknown): string | undefined {
  const base64 = resultBinaryBase64(value);
  if (base64 === undefined) return undefined;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new Error("Binary cell value must be valid base64");
  }
  return Buffer.from(base64, "base64").toString("hex");
}

function binaryLiteral(dialect: Dialect, value: unknown): string | undefined {
  const hex = binaryHex(value);
  if (hex === undefined) return undefined;
  switch (dialect.id) {
    case "mysql":
      return `X'${hex}'`;
    case "postgresql":
      return `decode(${dialect.escapeLiteral(Buffer.from(hex, "hex").toString("base64"))}, 'base64')`;
    case "sqlserver":
      return `0x${hex}`;
    case "common":
      return dialect.escapeLiteral(Buffer.from(hex, "hex").toString("base64"));
    case "clickhouse":
      return `unhex(${dialect.escapeLiteral(hex)})`;
    case "sqlite":
      return `X'${hex}'`;
    default:
      return dialect.escapeLiteral(Buffer.from(hex, "hex").toString("base64"));
  }
}

function valueForSql(dialect: Dialect, value: unknown): string {
  const binary = binaryLiteral(dialect, value);
  if (binary !== undefined) return binary;
  const normalized = valueOrigin(value);
  if (normalized == null) return "NULL";
  if (typeof normalized === "number" && Number.isFinite(normalized)) return String(normalized);
  if (typeof normalized === "boolean") return normalized ? "TRUE" : "FALSE";
  if (typeof normalized === "object") return dialect.escapeLiteral(JSON.stringify(normalized));
  return dialect.escapeLiteral(String(normalized));
}

function qualifiedTable(context: ResultMutationContext): string {
  if (!context.dialect || !context.table) {
    throw new Error("A SQL table and dialect are required for result mutations");
  }
  return context.schema
    ? `${context.dialect.quoteIdentifier(context.schema)}.${context.dialect.quoteIdentifier(context.table)}`
    : context.dialect.quoteIdentifier(context.table);
}

function keyNames(context: ResultMutationContext): string[] {
  const fromList = context.primaryKeyList?.map(fieldName).filter(Boolean) ?? [];
  if (fromList.length > 0) return fromList;
  return context.primaryKey ? [context.primaryKey] : [];
}

function rowPredicate(
  context: ResultMutationContext,
  row: Record<string, unknown>,
): string {
  if (!context.dialect) throw new Error("A SQL dialect is required for row predicates");
  const dialect = context.dialect;
  const fields = fieldsOf(context);
  const keys = keyNames(context);
  const names = keys.length > 0
    ? keys
    : fields.filter(canUseAsFallbackPredicate).map(fieldName).filter(Boolean);
  const conditions = names
    .map((name) => {
      if (!(name in row)) return undefined;
      const value = valueOrigin(row[name]);
      const identifier = dialect.quoteIdentifier(name);
      return value == null
        ? `${identifier} IS NULL`
        : `${identifier} = ${valueForSql(dialect, value)}`;
    })
    .filter((value): value is string => Boolean(value));
  return conditions.length > 0 ? conditions.join(" AND ") : "1 = 0";
}

function rowDocument(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([name]) => !["_XID", "_index", "_type", "_score"].includes(name)),
  );
}

function documentId(
  context: ResultMutationContext,
  row: Record<string, unknown>,
): unknown {
  const key = keyNames(context)[0] || "_id";
  return valueOrigin(row[key]);
}

function mongoTarget(context: ResultMutationContext): string {
  if (!context.database || !context.table) {
    throw new Error("MongoDB result mutations require database and collection names");
  }
  return `db(${JSON.stringify(context.database)}).collection(${JSON.stringify(context.table)})`;
}

function documentMutations(
  context: ResultMutationContext,
  request: ResultMutationRequest,
): string[] {
  const statements: string[] = [];
  if (context.dbType === "MongoDB") {
    const target = mongoTarget(context);
    for (const row of request.inserts ?? []) {
      statements.push(`${target}.insertOne(${JSON.stringify(rowDocument(row))})`);
    }
    for (const update of request.updates ?? []) {
      const id = documentId(context, update.original || update.current);
      if (id == null) continue;
      const changes = rowDocument(update.current);
      delete changes["_id"];
      statements.push(`${target}.updateOne({_id:${JSON.stringify(id)}},{$set:${JSON.stringify(changes)}})`);
    }
    for (const row of request.deletes ?? []) {
      const id = documentId(context, row);
      if (id != null) statements.push(`${target}.deleteOne({_id:${JSON.stringify(id)}})`);
    }
    return statements;
  }

  const table = context.table;
  if (!table) throw new Error("Elasticsearch result mutations require an index name");
  for (const row of request.inserts ?? []) {
    statements.push(`POST /${table}/_doc\n${JSON.stringify(rowDocument(row))}`);
  }
  for (const update of request.updates ?? []) {
    const id = documentId(context, update.original || update.current);
    if (id != null) statements.push(`POST /${table}/_doc/${encodeURIComponent(String(id))}\n${JSON.stringify(rowDocument(update.current))}`);
  }
  for (const row of request.deletes ?? []) {
    const id = documentId(context, row);
    if (id != null) statements.push(`DELETE /${table}/_doc/${encodeURIComponent(String(id))}`);
  }
  return statements;
}

function sqlMutations(
  context: ResultMutationContext,
  request: ResultMutationRequest,
): string[] {
  if (!context.dialect) throw new Error("A SQL dialect is required for result mutations");
  const dialect = context.dialect;
  const table = qualifiedTable(context);
  const statements: string[] = [];
  const fields = fieldsOf(context).map(fieldName).filter(Boolean);
  for (const row of request.inserts ?? []) {
    const entries = fields
      .filter((name) => name in row && row[name] !== undefined)
      .map((name) => ({ name, value: valueOrigin(row[name]) }));
    if (entries.length === 0) continue;
    statements.push(`INSERT INTO ${table} (${entries.map(({ name }) => dialect.quoteIdentifier(name)).join(", ")}) VALUES (${entries.map(({ value }) => valueForSql(dialect, value)).join(", ")});`);
  }
  for (const update of request.updates ?? []) {
    const original = update.original || update.current;
    const changes = fields
      .filter((name) => name in update.current && valueOrigin(update.current[name]) !== valueOrigin(original[name]))
      .map((name) => `${dialect.quoteIdentifier(name)} = ${valueForSql(dialect, update.current[name])}`);
    if (changes.length > 0) {
      statements.push(`UPDATE ${table} SET ${changes.join(", ")} WHERE ${rowPredicate(context, original)};`);
    }
  }
  for (const row of request.deletes ?? []) {
    statements.push(`DELETE FROM ${table} WHERE ${rowPredicate(context, row)};`);
  }
  return statements;
}

function insertStatement(
  context: ResultMutationContext,
  row: Record<string, unknown>,
  skipPrimaryKey: boolean,
): string | undefined {
  if (!context.dialect) throw new Error("A SQL dialect is required for result imports");
  const dialect = context.dialect;
  const excluded = new Set(skipPrimaryKey ? keyNames(context) : []);
  const entries = fieldsOf(context)
    .map(fieldName)
    .filter((name) => name && !excluded.has(name) && name in row && row[name] !== undefined)
    .map((name) => ({ name, value: valueOrigin(row[name]) }));
  if (entries.length === 0) return undefined;
  const columns = entries.map(({ name }) => dialect.quoteIdentifier(name)).join(", ");
  const values = entries.map(({ value }) => valueForSql(dialect, value)).join(", ");
  return "INSERT INTO " + qualifiedTable(context) + " (" + columns + ") VALUES (" + values + ");";
}

function sameKey(name: string, keys: readonly string[]): boolean {
  return keys.some((key) => key.toLowerCase() === name.toLowerCase());
}

function upsertStatement(
  context: ResultMutationContext,
  row: Record<string, unknown>,
): string {
  if (!context.dialect) throw new Error("A SQL dialect is required for result imports");
  const dialect = context.dialect;
  const keys = keyNames(context);
  if (keys.length === 0) {
    throw new Error("Upsert import requires primary-key metadata");
  }
  const entries = fieldsOf(context)
    .map(fieldName)
    .filter((name) => name && name in row && row[name] !== undefined)
    .map((name) => ({ name, value: valueOrigin(row[name]) }));
  const keyEntries = entries.filter(({ name }) => sameKey(name, keys));
  if (keyEntries.length !== keys.length) {
    throw new Error("Upsert import rows must include every primary-key column");
  }
  const updateEntries = entries.filter(({ name }) => !sameKey(name, keys));
  const columns = entries.map(({ name }) => dialect.quoteIdentifier(name)).join(", ");
  const values = entries.map(({ value }) => valueForSql(dialect, value)).join(", ");
  const target = qualifiedTable(context);
  const type = context.dbType;

  if (["MySQL", "MariaDB", "MySQLCompatible", "Doris"].includes(type)) {
    const assignments = updateEntries.length > 0
      ? updateEntries.map(({ name }) =>
        dialect.quoteIdentifier(name) + " = VALUES(" + dialect.quoteIdentifier(name) + ")").join(", ")
      : dialect.quoteIdentifier(keys[0]) + " = VALUES(" + dialect.quoteIdentifier(keys[0]) + ")";
    return "INSERT INTO " + target + " (" + columns + ") VALUES (" + values
      + ") ON DUPLICATE KEY UPDATE " + assignments + ";";
  }

  if (["PostgreSQL", "SQLite", "libSQL", "DuckDB", "Cockroach", "GaussDB"].includes(type)) {
    const keyColumns = keys.map((name) => dialect.quoteIdentifier(name)).join(", ");
    const assignments = updateEntries
      .map(({ name }) => dialect.quoteIdentifier(name) + " = EXCLUDED." + dialect.quoteIdentifier(name))
      .join(", ");
    return "INSERT INTO " + target + " (" + columns + ") VALUES (" + values + ") ON CONFLICT ("
      + keyColumns + ") DO " + (assignments ? "UPDATE SET " + assignments : "NOTHING") + ";";
  }

  if (["SqlServer", "AzureSQLServer", "MSSQL"].includes(type)) {
    const sourceColumns = entries.map(({ name }) => dialect.quoteIdentifier(name)).join(", ");
    const match = keys.map((name) =>
      "target." + dialect.quoteIdentifier(name) + " = source." + dialect.quoteIdentifier(name)).join(" AND ");
    const assignments = updateEntries.length > 0
      ? updateEntries.map(({ name }) =>
        "target." + dialect.quoteIdentifier(name) + " = source." + dialect.quoteIdentifier(name)).join(", ")
      : "target." + dialect.quoteIdentifier(keys[0]) + " = target." + dialect.quoteIdentifier(keys[0]);
    return "MERGE INTO " + target + " AS target USING (VALUES (" + values + ")) AS source ("
      + sourceColumns + ") ON " + match + " WHEN MATCHED THEN UPDATE SET " + assignments
      + " WHEN NOT MATCHED THEN INSERT (" + columns + ") VALUES (" + entries
        .map(({ name }) => "source." + dialect.quoteIdentifier(name)).join(", ") + ");";
  }

  if (["Oracle", "DM"].includes(type)) {
    const sourceColumns = entries.map(({ name }) =>
      valueForSql(dialect, row[name]) + " AS " + dialect.quoteIdentifier(name)).join(", ");
    const match = keys.map((name) =>
      "target." + dialect.quoteIdentifier(name) + " = source." + dialect.quoteIdentifier(name)).join(" AND ");
    const assignments = updateEntries.length > 0
      ? updateEntries.map(({ name }) =>
        "target." + dialect.quoteIdentifier(name) + " = source." + dialect.quoteIdentifier(name)).join(", ")
      : "target." + dialect.quoteIdentifier(keys[0]) + " = target." + dialect.quoteIdentifier(keys[0]);
    return "MERGE INTO " + target + " target USING (SELECT " + sourceColumns + " FROM DUAL) source ON ("
      + match + ") WHEN MATCHED THEN UPDATE SET " + assignments + " WHEN NOT MATCHED THEN INSERT ("
      + columns + ") VALUES (" + entries.map(({ name }) => "source." + dialect.quoteIdentifier(name)).join(", ") + ");";
  }

  throw new Error("Upsert import is not supported for " + type);
}

function documentImportMutations(
  context: ResultMutationContext,
  rows: readonly Record<string, unknown>[],
  mode: ResultImportMode,
): string[] {
  if (mode === "insert") {
    return buildResultMutationSql(context, { inserts: rows });
  }
  if (context.dbType === "MongoDB") {
    const target = mongoTarget(context);
    const keys = keyNames(context);
    return rows.map((row) => {
      const source = rowDocument(row);
      const filterNames = keys.length > 0 ? keys : ["_id"];
      const filter = Object.fromEntries(filterNames
        .filter((name) => name in row)
        .map((name) => [name, valueOrigin(row[name])]));
      if (Object.keys(filter).length === 0) {
        throw new Error("MongoDB upsert rows require a primary key or _id");
      }
      delete source["_id"];
      return target + ".updateOne(" + JSON.stringify(filter) + ",{$set:"
        + JSON.stringify(source) + "},{upsert:true})";
    });
  }
  const table = context.table;
  if (!table) throw new Error("Elasticsearch result imports require an index name");
  return rows.map((row) => {
    const id = documentId(context, row);
    const source = JSON.stringify(rowDocument(row));
    return id == null
      ? "POST /" + table + "/_doc\n" + source
      : "POST /" + table + "/_update/" + encodeURIComponent(String(id))
        + "\n" + JSON.stringify({ doc: rowDocument(row), doc_as_upsert: true });
  });
}

export function buildResultImportSql(
  context: ResultMutationContext,
  rows: readonly Record<string, unknown>[],
  options: ResultImportOptions = {},
): string[] {
  const mode = options.mode || "insert";
  if (context.dbType === "MongoDB" || context.dbType === "ElasticSearch") {
    return documentImportMutations(context, rows, mode);
  }
  if (mode === "upsert") {
    if (options.skipPrimaryKey) {
      throw new Error("skipPrimaryKey cannot be used with upsert import");
    }
    return rows.map((row) => upsertStatement(context, row));
  }
  return rows
    .map((row) => insertStatement(context, row, options.skipPrimaryKey === true))
    .filter((statement): statement is string => statement !== undefined);
}

export function buildResultMutationSql(
  context: ResultMutationContext,
  request: ResultMutationRequest,
): string[] {
  if (context.dbType === "MongoDB" || context.dbType === "ElasticSearch") {
    return documentMutations(context, request);
  }
  return sqlMutations(context, request);
}
