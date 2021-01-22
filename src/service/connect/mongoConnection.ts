import { Node } from "@/model/interface/node";
import { MongoClient } from "mongodb";
import { IConnection, queryCallback } from "./connection";

export class MongoConnection implements IConnection {
    private conneted: boolean;
    private client: MongoClient;
    constructor(private opt: Node) {

    }

    connect(callback: (err: Error) => void): void {
        MongoClient.connect(`mongodb://${this.opt.host}:${this.opt.port}`, (err, client) => {
            if (!err) {
                this.client = client;
                this.conneted = true;
            }
            callback(err)
        })
    }

    run(callback: (client: MongoClient) => void) {
        
        callback(this.client)
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
        return this.conneted;
    }

    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        if (sql == 'show dbs') {
            this.client.db().admin().listDatabases().then((res) => {
                callback(null, res.databases.map((db: any) => ({ Database: db.name })))
                console.log(res)
            })
        } else {
            console.log(sql)
            callback(null, null)
        }
    }

}