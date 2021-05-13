import { Node } from "@/model/interface/node";
import { EventEmitter } from "events";
import { IConnection, queryCallback } from "./connection";
import SQLite from "./sqlite";

export class SqliteConnection extends IConnection {
    private  sqlite: SQLite;
    private conneted: boolean;
    constructor(node: Node) {
        super()
        // this.db = new Database(':memory:');
        this.sqlite = new SQLite( 'C:/Users/CWJ/Desktop/Ditto_2.db');
        // this.db = new Database(node.dbPath);
    }
    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        let fields = [];
        this.sqlite.query(sql).then(res=>{
            callback(null,res,fields)
        })
    }
    connect(callback: (err: Error) => void): void {
        callback(null)
        this.conneted = true;
    }
    beginTransaction(callback: (err: Error) => void): void {
        callback(null)
    }
    rollback(): void {
    }
    commit(): void {
    }
    end(): void {
        // this.sqlite.close()
    }
    isAlive(): boolean {
        return this.conneted;
    }

}