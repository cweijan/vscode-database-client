import { QueryUnit } from "../queryUnit";
import { SqlDialect } from "./sqlDialect";

export class MysqlDialect implements SqlDialect{
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
}