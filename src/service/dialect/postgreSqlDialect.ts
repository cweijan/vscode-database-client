import { CreateIndexParam } from "./param/createIndexParam";
import { UpdateColumnParam } from "./param/updateColumnParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class PostgreSqlDialect extends SqlDialect {
    createIndex(createIndexParam: CreateIndexParam): string {
        const indexType = createIndexParam.indexType || "btree"
        return `CREATE INDEX ${createIndexParam.column}_${new Date().getTime()}_index ON ${createIndexParam.table} USING ${indexType} (${createIndexParam.column});`;
    }
    dropIndex(table: string, indexName: string): string {
        return `DROP INDEX ${indexName}`
    }
    showIndex(database: string, table: string): string {
        return `SELECT indexname index_name, indexdef FROM pg_indexes WHERE schemaname = 'public' and tablename='${table}'`
    }
    variableList(): string {
        return 'SHOW ALL'
    }
    statusList(): string {
        throw new Error("Method not implemented.");
    }
    processList(): string {
        return 'SELECT * from pg_stat_activity'
    }
    addColumn(table: string): string {
        return `ALTER TABLE
        ${table} 
    ADD 
        COLUMN [column] [type];`;
    }
    createUser(): string {
        return `CREATE USER [name] WITH PASSWORD 'password'`
    }
    updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string {
        comment = comment ? ` comment '${comment}'` : "";
        return `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${type};
ALTER TABLE ${table} ALTER RENAME COLUMN ${column} TO [newColumnName];`;
    }
    updateColumnSql(updateColumnParam: UpdateColumnParam): string {
        let { columnName, columnType, newColumnName, comment, nullable, table } = updateColumnParam
        const defaultDefinition = nullable ? "DROP NOT NULL" : "SET NOT NULL";
        let sql = `ALTER TABLE ${table} ALTER COLUMN ${columnName} TYPE ${columnType};
ALTER TABLE ${table} ALTER COLUMN ${columnName} ${defaultDefinition};`;
        if (comment) {
            sql = sql + `COMMENT ON COLUMN ${table}.${columnName} is '${comment}';`
        }
        if (columnName != newColumnName) {
            sql = sql + `ALTER TABLE ${table} RENAME COLUMN ${columnName} TO ${newColumnName};`
        }
        return sql;
    }
    showUsers(): string {
        return `SELECT usename "user" from pg_user `;
    }
    updateTable(update: UpdateTableParam): string {
        const { table, newTableName, comment, newComment } = update
        let sql = "";
        if (newComment && newComment != comment) {
            sql = `COMMENT ON TABLE ${table} IS '${newComment}';`;
        }
        if (newTableName && table != newTableName) {
            sql += `ALTER TABLE ${table} RENAME TO ${newTableName};`
        }
        return sql;
    }
    truncateDatabase(database: string): string {
        return `SELECT Concat('TRUNCATE TABLE "',TABLE_NAME, '";') trun FROM INFORMATION_SCHEMA.TABLES WHERE  table_schema ='public' AND table_type='BASE TABLE';`
    }
    createDatabase(database: string): string {
        return `create database "${database}"`;
    }
    showTableSource(database: string, table: string): string {
        return '';
        // return `SHOW CREATE TABLE "${database}"."${table}";`
    }
    showViewSource(database: string, table: string): string {
        return `SELECT CONCAT('CREATE VIEW ',table_name,'\nAS\n(',regexp_replace(view_definition,';$',''),')') "Create View",table_name,view_definition from information_schema.views where table_name='${table}';`
    }
    showProcedureSource(database: string, name: string): string {
        return `select pg_get_functiondef('${name}' :: regproc) "Create Procedure",'${name}' "Procedure";`;
    }
    showFunctionSource(database: string, name: string): string {
        return `select pg_get_functiondef('${name}' :: regproc) "Create Function",'${name}' "Function";`;
    }
    showTriggerSource(database: string, name: string): string {
        return `select pg_get_triggerdef(oid) "SQL Original Statement",'${name}' "Trigger" from pg_trigger where tgname = '${name}';`;
    }
    showColumns(database: string, table: string): string {
        const view = table.split('.')[1];
        return `SELECT c.COLUMN_NAME "name", DATA_TYPE "simpleType", DATA_TYPE "type", IS_NULLABLE nullable, CHARACTER_MAXIMUM_LENGTH "maxLength", COLUMN_DEFAULT "defaultValue", '' "comment", tc.constraint_type "key" FROM
        information_schema.columns c
        left join  information_schema.constraint_column_usage ccu
        on c.COLUMN_NAME=ccu.column_name and c.table_name=ccu.table_name and ccu.table_catalog=c.TABLE_CATALOG
        left join  information_schema.table_constraints tc
        on tc.constraint_name=ccu.constraint_name
        and tc.table_catalog=c.TABLE_CATALOG and tc.table_name=c.table_name WHERE c.TABLE_CATALOG = '${database}' AND c.table_name = '${view ? view : table}' ORDER BY ORDINAL_POSITION;`;
    }
    showTriggers(database: string): string {
        return `SELECT TRIGGER_NAME "TRIGGER_NAME" FROM information_schema.TRIGGERS WHERE trigger_catalog = '${database}'`;
    }
    showProcedures(database: string): string {
        return `SELECT ROUTINE_NAME "ROUTINE_NAME" FROM information_schema.routines WHERE ROUTINE_SCHEMA = 'public' and ROUTINE_TYPE='PROCEDURE'`;
    }
    showFunctions(database: string): string {
        return `SELECT ROUTINE_NAME "ROUTINE_NAME" FROM information_schema.routines WHERE ROUTINE_SCHEMA = 'public' and ROUTINE_TYPE='FUNCTION'`;
    }
    showViews(database: string): string {
        return `select table_name "name" from information_schema.tables where table_schema='public' and table_type='VIEW';`
    }
    showSystemViews(database: string): string {
        return `select CONCAT(table_schema,'.',table_name) "name" from information_schema.tables where table_schema!='public' and table_type='VIEW';`
    }
    buildPageSql(database: string, table: string, pageSize: number): string {
        return `SELECT * FROM ${table} LIMIT ${pageSize};`;
    }
    countSql(database: string, table: string): string {
        return `SELECT count(*) FROM ${table};`;
    }
    showTables(database: string): string {
        return `  SELECT t.table_name "name", pg_catalog.obj_description(pgc.oid, 'pg_class') "comment"
        FROM information_schema.tables t
        INNER JOIN pg_catalog.pg_class pgc
        ON t.table_name = pgc.relname 
        WHERE t.table_type='BASE TABLE'
        AND t.table_schema='public';`
    }
    showDatabases(): string {
        return `SELECT datname "Database" FROM pg_database WHERE datistemplate = false;`
    }
    tableTemplate(): string {
        return `CREATE TABLE [name](  
    id SERIAL NOT NULL primary key,
    created_time DATE,
    updated_time DATE,
    [column] varchar(255)
);
COMMENT ON TABLE [table] IS '[comment'];
COMMENT ON COLUMN [table].[column] IS '[comment]';`
    }
    viewTemplate(): string {
        return `CREATE VIEW [name]
AS
(SELECT * FROM ...);`
    }
    procedureTemplate(): string {
        return `CREATE PROCEDURE [name]()
LANGUAGE SQL
as $$
[content]
$$`;
    }
    triggerTemplate(): string {
        return `CREATE FUNCTION [tri_fun]() RETURNS TRIGGER AS 
$body$
BEGIN
    RETURN [value];
END;
$body$ 
LANGUAGE plpgsql;

CREATE TRIGGER [name] 
[BEFORE/AFTER/INSTEAD OF] [INSERT/UPDATE/DELETE]
ON [table]
FOR EACH ROW
EXECUTE PROCEDURE [tri_fun]();`
    }
    dropTriggerTemplate(name: string) {
        return `DROP TRIGGER ${name} on [table_name]`;
    }
    functionTemplate(): string {
        return `CREATE FUNCTION [name]() 
RETURNS [type] AS $$
BEGIN
    return [type];
END;
$$ LANGUAGE plpgsql;`
    }
}