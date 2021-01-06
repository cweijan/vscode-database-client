import { DatabaseType } from "@/common/constants";
import { MssqlDIalect } from "./mssqlDIalect";
import { MysqlDialect } from "./mysqlDialect";

export interface SqlDialect {
    showDatabases(): string;
    showTables(database:string): string;
    showColumns(database:string,table:string): string;
    showViews(database:string): string;
    showTriggers(database:string): string;
    showProcedures(database:string): string;
    showFunctions(database:string): string;
    buildPageSql(database:string,table:string,pageSize:number):string;
    tableTemplate():string;
    viewTemplate():string;
    procedureTemplate():string;
    triggerTemplate():string;
    functionTemplate():string;
}

export function getDialect(dbType: DatabaseType): SqlDialect {
    switch (dbType) {
        case DatabaseType.MSSQL:
            return new MssqlDIalect()
    }
    return new MysqlDialect()
}