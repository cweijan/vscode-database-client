import { Node } from "@/model/interface/node";
import { EventEmitter } from "events";
import { IConnection, queryCallback } from "./connection";
import SQLite from "./sqlite";

export class SqliteConnection extends IConnection {
    private sqlite: SQLite;
    private conneted: boolean;
    constructor(node: Node) {
        super()
        this.sqlite = new SQLite(node.dbPath);
    }
    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        this.sqlite.query(sql + ";").then(res => {
            if (Array.isArray(res)) {
                callback(null, res)
            } else {
                callback(null, res.rows, res.fields)
            }
        }).catch(err => {
            callback(err)
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