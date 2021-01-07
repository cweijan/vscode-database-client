import { DatabaseType } from "@/common/constants";
import { abort } from "process";
import { MssqlDIalect } from "./mssqlDIalect";
import { MysqlDialect } from "./mysqlDialect";
import { PostgreSqlDialect } from "./postgreSqlDialect";

export interface SqlDialect {
    switchDataBase(database: string): string;
    showDatabases(): string;
    showTables(database: string): string;
    showColumns(database: string, table: string): string;
    showViews(database: string): string;
    showUsers(): string;
    showTriggers(database: string): string;
    showProcedures(database: string): string;
    showFunctions(database: string): string;
    buildPageSql(database: string, table: string, pageSize: number): string;
    countSql(database: string, table: string): string;
    createDatabase(database: string): string;
    truncateDatabase(database: string): string;
    renameTable(database: string, tableName: string, newName: string): string;
    showTableSource(database: string, table: string): string;
    showViewSource(database: string, table: string): string;
    showProcedureSource(database: string, name: string): string;
    showFunctionSource(database: string, name: string): string;
    showTriggerSource(database: string, name: string): string;
    tableTemplate(): string;
    viewTemplate(): string;
    procedureTemplate(): string;
    triggerTemplate(): string;
    functionTemplate(): string;
}

export function getDialect(dbType: DatabaseType): SqlDialect {
    switch (dbType) {
        case DatabaseType.MSSQL:
            return new MssqlDIalect()
        case DatabaseType.PG:
            return new PostgreSqlDialect();
    }
    return new MysqlDialect()
}