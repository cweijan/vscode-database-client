import { QueryUnit } from "../queryUnit";
import { SqlDialect } from "./sqlDialect";

export class PostgreSqlDialect implements SqlDialect{
    /**
     * postgre cannot change database.
     */
    switchDataBase(database: string): string {
        return "select 1;";
    }
    renameTable(database: string, tableName: string, newName: string): string {
        return `RENAME TABLE "${database}"."${tableName}" to "${database}"."${newName}"`;
    }
    truncateDatabase(database: string): string {
        return `SELECT Concat('TRUNCATE TABLE "',TABLE_NAME, '";') trun FROM INFORMATION_SCHEMA.TABLES WHERE  table_schema ='public' AND table_type='BASE TABLE';`
    }
    createDatabase(database: string): string {
        return `create database "${database}"`;
    }
    showTableSource(database: string, table: string): string {
        return `SHOW CREATE TABLE "${database}"."${table}"`
    }
    showViewSource(database: string, table: string): string {
        return `SELECT CONCAT('CREATE VIEW ',table_name,'\nAS\n(',view_definition,');') "Create View",table_name,view_definition from information_schema.views where table_name=${table};`
    }
    showProcedureSource(database: string, name: string): string {
        return `SELECT CONCAT('CREATE PROCEDURE ',ROUTINE_NAME,'()\nLANGUAGE ',routine_body,'\nAS $$',routine_definition,'$$;') "Create Procedure",ROUTINE_NAME,routine_definition,routine_body,data_type FROM information_schema.routines WHERE ROUTINE_SCHEMA = 'public'  and ROUTINE_TYPE='PROCEDURE' and routine_body!='EXTERNAL' AND ROUTINE_NAME='${name}'
        union
        SELECT CONCAT('CREATE PROCEDURE ',ROUTINE_NAME,'()\nLANGUAGE plpgsql\nAS $$',routine_definition,'$$;') "Create Procedure",ROUTINE_NAME,routine_definition,routine_body,data_type FROM information_schema.routines WHERE ROUTINE_SCHEMA = 'public'  and ROUTINE_TYPE='PROCEDURE' and routine_body='EXTERNAL AND ROUTINE_NAME='${name}'`;
    }
    showFunctionSource(database: string, name: string): string {
        return `SELECT CONCAT('CREATE FUNCTION ',ROUTINE_NAME,'()\nRETURNS ',data_type,'\nAS $$',
        routine_definition,'$$  LANGUAGE ',routine_body,';') "Create Function",ROUTINE_NAME,routine_definition,routine_body,data_type FROM information_schema.routines WHERE ROUTINE_SCHEMA = 'public'  and ROUTINE_TYPE='FUNCTION' and routine_body!='EXTERNAL'
        AND ROUTINE_NAME='${name}'
        union 
        SELECT CONCAT('CREATE FUNCTION ',ROUTINE_NAME,'()\nRETURNS ',data_type,'\nAS $$',routine_definition,'$$  LANGUAGE plpgsql;') "Create Function",ROUTINE_NAME,routine_definition,routine_body,data_type FROM information_schema.routines WHERE ROUTINE_SCHEMA = 'public'  and ROUTINE_TYPE='FUNCTION' and routine_body='EXTERNAL'
        AND ROUTINE_NAME='${name}'`;
    }
    showTriggerSource(database: string, name: string): string {
        return `SHOW CREATE TRIGGER "${database}"."${name}"`;
    }
    showColumns(database: string,table:string): string {
        const view = table.split('.')[1];
        return `SELECT COLUMN_NAME "name",DATA_TYPE "simpleType",DATA_TYPE "type",IS_NULLABLE nullable,CHARACTER_MAXIMUM_LENGTH "maxLength",COLUMN_DEFAULT "defaultValue",'' "comment" FROM information_schema.columns WHERE TABLE_CATALOG = '${database}' AND table_name = '${view?view:table}' ORDER BY ORDINAL_POSITION;`;
    }
    showTriggers(database: string): string {
        return `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = '${database}'`;
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
    buildPageSql(database: string, table: string, pageSize: number):string {
        return  `SELECT * FROM ${table} LIMIT ${pageSize};`;
    }
    countSql(database: string, table: string): string {
        return `SELECT count(*) FROM ${table};`;
    }
    showTables(database: string): string {
        return `select table_name "name" from information_schema.tables where table_schema='public' and table_type='BASE TABLE' ;`
    }
    showDatabases(): string {
        return `SELECT datname "Database" FROM pg_database WHERE datistemplate = false;`
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
        return `CREATE PROCEDURE [name]()
LANGUAGE SQL
as $$
[content]
$$`;
    }
    triggerTemplate(): string {
        return `CREATE
TRIGGER [name] [BEFORE/AFTER] [INSERT/UPDATE/DELETE]
ON [table]
FOR EACH ROW BEGIN

END;`
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