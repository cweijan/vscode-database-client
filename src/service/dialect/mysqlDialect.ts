import { QueryUnit } from "../queryUnit";
import { SqlDialect } from "./sqlDialect";

export class MysqlDialect implements SqlDialect{
    showTables(database: string): string {
        return `SELECT table_comment comment,TABLE_NAME tableName FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${database}' and TABLE_TYPE<>'VIEW' order by table_name LIMIT ${QueryUnit.maxTableCount} ;`
    }
    showDatabases(): string {
        return "show databases"
    }
}