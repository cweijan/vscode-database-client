import { FieldInfo, Query } from "mysql2";

export abstract class IConnection {
    protected dumpMode: boolean = false;
    public enableDumpMode(){
        this.dumpMode=true;
    };
    abstract query(sql: string, callback?: queryCallback): void | Query;
    abstract query(sql: string, values: any, callback?: queryCallback): void | Query;
    abstract connect(callback: (err: Error) => void): void;
    abstract beginTransaction(callback: (err: Error) => void): void;
    abstract rollback(): void;
    abstract commit(): void;
    abstract end(): void;
    abstract isAlive(): boolean;
}


/**
 * fieldInfo, need name/orgTable
 */
export type queryCallback = (err: Error | null, results?: any, fields?: FieldInfo[], total?: number) => void;

export interface QueryFunction {

    (options: string, callback?: queryCallback);

    (options: string, values: any, callback?: queryCallback);
}


