import { window } from "vscode";
import { SqlDialect } from "./sqlDialect";

export class MssqlDIalect implements SqlDialect {
    renameTable(database: string, tableName: string, newName: string): string {
        return `sp_rename '${tableName}', '${newName}'`;
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
     */
    showColumns(database: string, table: string): string {
        return `SELECT COLUMN_NAME name,DATA_TYPE simpleType,DATA_TYPE type,IS_NULLABLE nullable,CHARACTER_MAXIMUM_LENGTH maxLength,COLUMN_DEFAULT defaultValue,'' comment FROM information_schema.columns WHERE TABLE_CATALOG = '${database}' AND table_name = '${table.split('.')[1]}' ORDER BY ORDINAL_POSITION;`;
    }
    showTriggers(database: string): string {
        // throw new Error("Unimplments!")
        // https://stackoverflow.com/questions/4305691/need-to-list-all-triggers-in-sql-server-database-with-table-name-and-tables-sch
        return `SELECT OBJECT_NAME(parent_id) as Table_Name, * FROM [${database}].sys.triggers`;
    }
    showProcedures(database: string): string {
        return `SELECT concat(ROUTINE_SCHEMA,'.',ROUTINE_NAME) ROUTINE_NAME FROM information_schema.routines WHERE SPECIFIC_CATALOG = '${database}' and ROUTINE_TYPE='PROCEDURE'`;
    }
    showFunctions(database: string): string {
        return `SELECT concat(ROUTINE_SCHEMA,'.',ROUTINE_NAME) ROUTINE_NAME FROM information_schema.routines WHERE SPECIFIC_CATALOG = '${database}' and ROUTINE_TYPE='FUNCTION'`;
    }
    showViews(database: string): string {
        if (database.toLowerCase() == 'master') {
            return `SELECT concat(SCHEMA_NAME(schema_id),'.',name) name FROM [sys].[all_views] ORDER BY name`;
        }
        return `SELECT concat(TABLE_SCHEMA,'.',TABLE_NAME) name FROM INFORMATION_SCHEMA.VIEWS  WHERE TABLE_CATALOG = '${database}' `;
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
);`
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
        return `CREATE
TRIGGER [name] 
ON [table]
[INSTEAD OF/AFTER] [INSERT/UPDATE/DELETE]
AS

END;`
    }
    functionTemplate(): string {
        return `CREATE
FUNCTION [name]() RETURNS [TYPE]
BEGIN
    return [value];
END;`
    }
}