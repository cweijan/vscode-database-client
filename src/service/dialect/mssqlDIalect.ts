import { SqlDialect } from "./sqlDialect";

export class MssqlDIalect implements SqlDialect {
    showTriggers(database: string): string {
        throw new Error("Unimplments!")
        // return `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = '${database}'`;
    }
    showProcedures(database: string): string {
        return `SELECT ROUTINE_NAME FROM information_schema.routines WHERE SPECIFIC_CATALOG = '${database}' and ROUTINE_TYPE='PROCEDURE'`;
    }
    showFunctions(database: string): string {
        return `SELECT ROUTINE_NAME FROM information_schema.routines WHERE SPECIFIC_CATALOG = '${database}' and ROUTINE_TYPE='FUNCTION'`;
    }
    showViews(database: string): string {
        return `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS  WHERE TABLE_CATALOG = '${database}' `;
    }
    buildPageSql(database: string, table: string, pageSize: number): string {
        return  `SELECT TOP ${pageSize} * FROM ${database}.${table};`;
    }
    showTables(database: string): string {
        return `SELECT TABLE_NAME tableName FROM master.INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'  AND TABLE_CATALOG='${database}'`
    }
    showDatabases(): string {
        return "SELECT name 'Database' FROM master.sys.databases"
    }

}