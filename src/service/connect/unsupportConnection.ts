import { Node } from "@/model/interface/node";
import { EventEmitter } from "events";
import { IConnection, queryCallback } from "./connection";

export class UnsupportConnection extends IConnection{
    constructor(private node: Node) {
        super()
    }
    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any): void | EventEmitter {
    }
    connect(callback: (err: Error) => void): void {
        callback(new Error(`Unsupport ${this.node.dbType}. Consider upgrade the extension`))
    }
    beginTransaction(callback: (err: Error) => void): void {
    }
    rollback(): void {
    }
    commit(): void {
    }
    end(): void {
    }
    isAlive(): boolean {
        return false;
    }


}