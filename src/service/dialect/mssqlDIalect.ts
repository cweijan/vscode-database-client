import { window } from "vscode";
import { CreateIndexParam } from "./param/createIndexParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class MssqlDIalect extends SqlDialect {
    createIndex(createIndexParam:CreateIndexParam): string{
        return `ALTER TABLE ${createIndexParam.table} ADD ${createIndexParam.type} (${createIndexParam.column})`;
    }
    showIndex(database: string, table: string): string {
        return `SELECT
        index_name = ind.name,
        column_name = col.name,
        ind.is_primary_key,
        ind.is_unique,
        ind.is_unique_constraint
      FROM
        sys.indexes ind
        INNER JOIN sys.index_columns ic ON ind.object_id = ic.object_id
        and ind.index_id = ic.index_id
        INNER JOIN sys.columns col ON ic.object_id = col.object_id
        and ic.column_id = col.column_id
        INNER JOIN sys.tables t ON ind.object_id = t.object_id
      WHERE
        t.name = '${table.split('.')[1]}';`
    }
    variableList(): string {
        throw new Error("Method not implemented.");
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
        [column] [type];`;
    }
    createUser(): string {
        return `CREATE LOGIN [name] WITH PASSWORD = 'password'`;
    }
    updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string {
        const defaultDefinition = nullable == "YES" ? "NULL":"NOT NULL" ;
        comment = comment ? ` comment '${comment}'` : "";
        return `EXEC sp_rename '${table}.${column}', '${column}', 'COLUMN'
ALTER TABLE ${table} ALTER COLUMN ${column} ${type} ${defaultDefinition};
`;
    }
    showUsers(): string {
        return `SELECT name [user] from sys.database_principals where type='S'`
    }
    updateTable(update: UpdateTableParam):string{
        const {database,table,newTableName}=update
        return `sp_rename '${table}', '${newTableName}'`;
    }
    truncateDatabase(database: string): string {
        return `SELECT Concat('TRUNCATE TABLE [',table_schema,'].[',TABLE_NAME, '];') trun FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'  AND TABLE_CATALOG='${database}'`
    }
    createDatabase(database: string): string {
        return `create database ${database}`;
    }
    showTableSource(database: string, table: string): string {
        window.showErrorMessage("Show Source Not Support Sql Server.")
        throw new Error("Show Source Not Support Sql Server.")
    }
    showViewSource(database: string, table: string): string {
        return `SELECT definition 'Create View' FROM sys.sql_modules WHERE object_id = OBJECT_ID('${table}')`
    }
    showProcedureSource(database: string, name: string): string {
        return `SELECT definition 'Create Procedure' FROM sys.sql_modules WHERE object_id = OBJECT_ID('${name}')`
    }
    showFunctionSource(database: string, name: string): string {
        return `SELECT definition 'Create Function' FROM sys.sql_modules WHERE object_id = OBJECT_ID('${name}')`
    }
    showTriggerSource(database: string, name: string): string {
        return `SELECT definition 'SQL Original Statement' FROM sys.sql_modules WHERE object_id = OBJECT_ID('${name}')`
    }
    /**
     * remove extra、COLUMN_COMMENT(comment)、COLUMN_KEY(key)
     * mssql table column has primary and unique in same column, so it occur duplicate column.
     */
    showColumns(database: string, table: string): string {
        return `SELECT c.COLUMN_NAME "name", DATA_TYPE "simpleType", DATA_TYPE "type", IS_NULLABLE nullable, CHARACTER_MAXIMUM_LENGTH "maxLength", COLUMN_DEFAULT "defaultValue", '' "comment", tc.constraint_type "key" FROM
        information_schema.columns c
        left join  information_schema.constraint_column_usage ccu
        on c.COLUMN_NAME=ccu.column_name and c.table_name=ccu.table_name and ccu.table_catalog=c.TABLE_CATALOG
        left join  information_schema.table_constraints tc
        on tc.constraint_name=ccu.constraint_name
        and tc.table_catalog=c.TABLE_CATALOG and tc.table_name=c.table_name WHERE c.TABLE_CATALOG = '${database}' AND c.table_name = '${table.split('.')[1]}' ORDER BY ORDINAL_POSITION`;
    }
    showTriggers(database: string): string {
        return `SELECT OBJECT_NAME(PARENT_OBJECT_ID) AS PARENT_TABLE, concat(SCHEMA_NAME(schema_id),'.',name) TRIGGER_NAME FROM SYS.OBJECTS WHERE TYPE = 'TR'`;
    }
    showProcedures(database: string): string {
        return `SELECT concat(ROUTINE_SCHEMA,'.',ROUTINE_NAME) ROUTINE_NAME FROM information_schema.routines WHERE SPECIFIC_CATALOG = '${database}' and ROUTINE_TYPE='PROCEDURE'`;
    }
    showFunctions(database: string): string {
        return `SELECT concat(ROUTINE_SCHEMA,'.',ROUTINE_NAME) ROUTINE_NAME FROM information_schema.routines WHERE SPECIFIC_CATALOG = '${database}' and ROUTINE_TYPE='FUNCTION'`;
    }
    showViews(database: string): string {
        return `SELECT concat(TABLE_SCHEMA,'.',TABLE_NAME) name FROM INFORMATION_SCHEMA.VIEWS`;
    }
    showSystemViews(database: string): string {
        return `SELECT concat(SCHEMA_NAME(schema_id),'.',name) name FROM [sys].[system_views] ORDER BY name`;
    }
    buildPageSql(database: string, table: string, pageSize: number): string {
        return `SELECT TOP ${pageSize} * FROM ${table};`;
    }
    countSql(database: string, table: string): string {
        return `SELECT count(*) count FROM ${table};`;
    }
    showTables(database: string): string {
        return `SELECT concat(TABLE_SCHEMA,'.',TABLE_NAME) 'name' FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'  AND TABLE_CATALOG='${database}'`
    }
    showDatabases(): string {
        return "SELECT name 'Database' FROM master.sys.databases"
    }
    tableTemplate(): string {
        return `CREATE TABLE [name](  
    id int NOT NULL primary key,
    created_time DATETIME,
    updated_time DATETIME,
    [column] varchar(255)
);
EXECUTE sp_addextendedproperty N'MS_Description', '[table_comment]', N'user', N'dbo', N'table', N'[table_name]', NULL, NULL;
EXECUTE sp_addextendedproperty N'MS_Description', '[column_comment]', N'user', N'dbo', N'table', N'[table_name]', N'column', N'[column_name]';
`
    }
    viewTemplate(): string {
        return `CREATE
VIEW [name]
AS
(SELECT * FROM ...);`
    }
    procedureTemplate(): string {
        return `CREATE
PROCEDURE [name]
AS
BEGIN

END;`;
    }
    triggerTemplate(): string {
        return `CREATE TRIGGER [name] 
ON [table]
[INSTEAD OF/AFTER] [INSERT/UPDATE/DELETE]
AS
BEGIN

END;`
    }
    functionTemplate(): string {
        return `CREATE FUNCTION [name]() RETURNS [TYPE]
BEGIN
    return [value];
END;`
    }
}