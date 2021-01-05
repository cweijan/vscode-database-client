import { SqlDialect } from "./sqlDialect";

export class MssqlDIalect implements SqlDialect {
    showTables(database: string): string {
        return `SELECT TABLE_NAME tableName FROM [${database}].INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`
    }
    showDatabases(): string {
        return "SELECT name 'Database' FROM master.sys.databases"
    }

}