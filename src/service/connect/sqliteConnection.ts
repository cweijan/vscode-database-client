import { Node } from "@/model/interface/node";
import { EventEmitter } from "events";
import { IConnection, queryCallback } from "./connection";
import SQLite from "./sqlite";
import { execute } from "./sqlite/sqlite";

export class SqliteConnection extends IConnection {
    private sqlite: SQLite;
    private conneted: boolean;
    constructor(node: Node) {
        super()
        // this.db = new Database(':memory:');
        this.sqlite = new SQLite('C:/Users/CWJ/Desktop/Ditto_2.db');
        // this.db = new Database(node.dbPath);
        new SQLite( 'C:/Users/CWJ/Desktop/Ditto_2.db').query('SELECT * FROM data limit 12;').then((res:any)=>{
            console.log(JSON.stringify(res))
        })
        
        execute('sqlite/sqlite-v3.26.0-win32-x86.exe','C:/Users/CWJ/Desktop/Ditto_2.db','SELECT * FROM data limit 12;',(res=>{
            console.log(JSON.stringify(res))
        }))
        
    }
    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        new SQLite('C:/Users/CWJ/Desktop/Ditto_2.db').query(sql).then(res => {
            if (Array.isArray(res)) {
                callback(null, res)
            } else {
                callback(null,res.rows,res.fields)
            }
        }).catch(err=>{
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