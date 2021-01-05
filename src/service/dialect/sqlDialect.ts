import { DatabaseType } from "@/common/constants";
import { MssqlDIalect } from "./mssqlDIalect";
import { MysqlDialect } from "./mysqlDialect";

export interface SqlDialect {
    showDatabases(): string;
    showTables(database:string): string;
}

export function getDialect(dbType: DatabaseType): SqlDialect {
    switch (dbType) {
        case DatabaseType.MSSQL:
            return new MssqlDIalect()
    }
    return new MysqlDialect()
}