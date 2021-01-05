import { DatabaseType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { FieldInfo } from "mysql2";
import { MSSqlConnnection } from "./mssqlConnection";
import { MysqlConnection } from "./mysqlConnection";

export interface IConnection {
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    connect(callback: (err: Error) => void): void;
    beginTransaction(callback: (err: Error) => void): void;
    rollback(): void;
    commit(): void;
    end(): void;
    isAlive(): boolean;
}


/**
 * fieldInfo, need name/orgTable
 */
export type queryCallback = (err: Error | null, results?: any, fields?: FieldInfo[]) => void;

export interface QueryFunction {

    (options: string, callback?: queryCallback);

    (options: string, values: any, callback?: queryCallback);
}


export function create(opt: Node) {
    switch (opt.dbType) {
        case DatabaseType.MSSQL:
            return new MSSqlConnnection(opt)
    }
    return new MysqlConnection(opt)
}