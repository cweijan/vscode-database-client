import { QueryUnit } from "../queryUnit";
import { SqlDialect } from "./sqlDialect";

export class MysqlDialect implements SqlDialect{
    showColumns(database: string,table:string): string {
        return `SELECT COLUMN_NAME name,DATA_TYPE simpleType,COLUMN_TYPE type,COLUMN_COMMENT comment,COLUMN_KEY \`key\`,IS_NULLABLE nullable,CHARACTER_MAXIMUM_LENGTH maxLength,COLUMN_DEFAULT defaultValue,EXTRA extra FROM information_schema.columns WHERE table_schema = '${database}' AND table_name = '${table}' ORDER BY ORDINAL_POSITION;`;
    }
    showTriggers(database: string): string {
        return `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = '${database}'`;
    }
    showProcedures(database: string): string {
        return `SELECT ROUTINE_NAME FROM information_schema.routines WHERE ROUTINE_SCHEMA = '${database}' and ROUTINE_TYPE='PROCEDURE'`;
    }
    showFunctions(database: string): string {
        return `SELECT ROUTINE_NAME FROM information_schema.routines WHERE ROUTINE_SCHEMA = '${database}' and ROUTINE_TYPE='FUNCTION'`;
    }
    showViews(database: string): string {
        return `SELECT TABLE_NAME FROM information_schema.VIEWS  WHERE TABLE_SCHEMA = '${database}' LIMIT ${QueryUnit.maxTableCount}`;
    }
    buildPageSql(database: string, table: string, pageSize: number):string {
        return  `SELECT * FROM ${database}.${table} LIMIT ${pageSize};`;
    }
    showTables(database: string): string {
        return `SELECT table_comment comment,TABLE_NAME tableName FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${database}' and TABLE_TYPE<>'VIEW' order by table_name LIMIT ${QueryUnit.maxTableCount} ;`
    }
    showDatabases(): string {
        return "show databases"
    }
    tableTemplate(): string {
        return `CREATE TABLE [name](  
    id int NOT NULL primary key AUTO_INCREMENT comment 'primary key',
    created_time DATETIME COMMENT 'created tiem',
    updated_time DATETIME COMMENT 'updated tiem',
    [column] varchar(255) comment ''
) default charset utf8 comment '';`
    }
    viewTemplate(): string {
        return `CREATE
VIEW [name]
AS
(SELECT * FROM ...);`
    }
    procedureTemplate(): string {
        return `CREATE
PROCEDURE [name]()
BEGIN

END;`;
    }
    triggerTemplate(): string {
        return `CREATE
TRIGGER [name] [BEFORE/AFTER] [INSERT/UPDATE/DELETE]
ON [table]
FOR EACH ROW BEGIN

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