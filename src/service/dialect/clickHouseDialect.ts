import { ColumnMeta } from "@/common/typeDef";
import { CreateIndexParam } from "./param/createIndexParam";
import { UpdateColumnParam } from "./param/updateColumnParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class ClickHouseDialect extends SqlDialect {
  showVersion() {
    return "select version() server_version";
  }
  createIndex(createIndexParam: CreateIndexParam): string {
    const indexType = createIndexParam.indexType || "btree";
    return `CREATE INDEX ${
      createIndexParam.column
    }_${new Date().getTime()}_index ON ${
      createIndexParam.table
    } USING ${indexType} (${createIndexParam.column})`;
  }
  dropIndex(table: string, indexName: string): string {
    return `DROP INDEX ${indexName}`;
  }
  showIndex(database: string, table: string): string {
    return `select name index_name,is_in_sorting_key indexdef  FROM system.columns WHERE database = '${database}' and table ='${table}'`;
  }
  variableList(): string {
    return "select name , value as setting,description from system.settings s ";
  }
  statusList(): string {
    return `select name as db , engine as status from system.databases d `;
  }
  processList(): string {
    return `
    SELECT query_id AS "Id", user AS "User", client_hostname AS "Host", port AS "Port", current_database AS "db", query AS "Command", os_user AS "State", addSeconds(now(), elapsed) AS "Time", elapsed AS "Info"
    FROM system.processes p 
    ORDER BY elapsed desc`;
  }
  addColumn(table: string, column?: string): string {
    return `ALTER TABLE
    ${table} 
ADD 
    COLUMN [column] [type]`;
  }
  createUser(): string {
    return `CREATE USER [name] WITH PASSWORD 'password'`;
  }
  updateColumn(table: string, column: ColumnMeta): string {
    let { name, type, comment, nullable, defaultValue } = column;
    comment = comment ? ` comment '${comment}'` : "";
    return `ALTER TABLE ${table} ALTER COLUMN ${name} TYPE ${type};
ALTER TABLE ${table} RENAME COLUMN ${name} TO [newColumnName]`;
  }
  updateColumnSql(updateColumnParam: UpdateColumnParam): string {
    let { columnName, columnType, newColumnName, comment, nullable, table } =
      updateColumnParam;
    const defaultDefinition = nullable ? "DROP NOT NULL" : "SET NOT NULL";
    let sql = `ALTER TABLE ${table} ALTER COLUMN ${columnName} TYPE ${columnType};
ALTER TABLE ${table} ALTER COLUMN ${columnName} ${defaultDefinition}`;
    if (comment) {
      sql = sql + `COMMENT ON COLUMN ${table}.${columnName} is '${comment}';`;
    }
    if (columnName != newColumnName) {
      sql =
        sql +
        `ALTER TABLE ${table} RENAME COLUMN ${columnName} TO ${newColumnName};`;
    }
    return sql;
  }
  showUsers(): string {
    return `SELECT usename "user" from pg_user `;
  }
  pingDataBase(database: string): string {
    return "select 1";
  }
  updateTable(update: UpdateTableParam): string {
    const { table, newTableName, comment, newComment } = update;
    let sql = "";
    if (newComment && newComment != comment) {
      sql = `COMMENT ON TABLE ${table} IS '${newComment}';`;
    }
    if (newTableName && table != newTableName) {
      sql += `ALTER TABLE ${table} RENAME TO ${newTableName};`;
    }
    return sql;
  }
  truncateDatabase(database: string): string {
    return `SELECT Concat('TRUNCATE TABLE "',TABLE_NAME, '";') trun FROM INFORMATION_SCHEMA.TABLES WHERE  table_schema ='${database}' AND table_type='BASE TABLE';`;
  }
  createDatabase(database: string): string {
    return `CREATE DATABASE [name]`;
  }
  showTableSource(database: string, table: string): string {
    return `SELECT create_table_query as "Create Table",name as table_name,'definition' as view_definition from system.tables WHERE database='${database}' and table='${table}'`;
  }
  showViewSource(database: string, table: string): string {
    return `SELECT create_table_query as "Create View",name as table_name,'definition' as view_definition from system.tables WHERE database='${database}' and table='${table}'`;
  }
  showProcedureSource(database: string, name: string): string {
    return 'select number from system.numbers where 1=0';
  }
  showFunctionSource(database: string, name: string): string {
    return 'select number from system.numbers where 1=0';
  }
  showTriggerSource(database: string, name: string): string {
    return 'select number from system.numbers where 1=0';
  }
  showColumns(database: string, table: string): string {
    const view = table.split(".")[1];
    return `select name,type, if(type like '%Nullable%',1,0) as nullable,null as maxLength,default_expression as defaultValue,comment,is_in_primary_key as key from system.columns c where database='${database}' and table='${table}' `;
  }
  showTriggers(database: string): string {
    return 'select number from system.numbers where 1=0';
  }
  showProcedures(database: string): string {
    return 'select number from system.numbers where 1=0';
  }
  showFunctions(database: string): string {
    return `select name as "ROUTINE_NAME" from system.functions  where origin !='System'`;
  }
  showViews(database: string): string {
    return `select name ,engine as type from system.tables where database='${database}' and engine ilike '%view%'`;
  }
  buildPageSql(database: string, table: string, pageSize: number): string {
    return `SELECT * FROM ${table} LIMIT ${pageSize}`;
  }
  countSql(database: string, table: string): string {
    return `SELECT count(*) FROM ${database}.${table}`;
  }
  showTables(database: string): string {
    return `select name ,engine as type , null as comment from system.tables where database='${database}' and engine not ilike '%view%' `;
  }
  showDatabases() {
    return `SELECT name as Database FROM system.databases where name not ilike '%information_schema%' order by name ASC`;
  }
  showSchemas(): string {
    return `SELECT name as Database FROM system.databases where name not ilike '%information_schema%' order by name ASC`;
  }
  tableTemplate(): string {
    return `CREATE TABLE [name](  
    CounterID UInt32,
    id UInt64 NOT NULL,
    [column] String 
)
ENGINE = MergeTree()
ORDER BY (CounterID, id, intHash32(id));`;
  }
  viewTemplate(): string {
    return `CREATE VIEW [name]
AS
(SELECT * FROM ...)`;
  }
  procedureTemplate(): string {
    return 'select number from system.numbers where 1=0';
  }
  triggerTemplate(): string {
    return 'select number from system.numbers where 1=0';
  }
  dropTriggerTemplate(name: string): string {
    return 'select number from system.numbers where 1=0';
  }
  functionTemplate(): string {
    return `CREATE FUNCTION [func_name] AS (a, b, c) -> a * b * c;`;
  }
}
