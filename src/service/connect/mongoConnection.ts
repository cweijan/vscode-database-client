import { Node } from "@/model/interface/node";
import { MongoClient } from "mongodb";
import { IConnection, queryCallback } from "./connection";

export class MongoConnection extends IConnection {
    private conneted: boolean;
    private client: MongoClient;
    constructor(private opt: Node) {
        super()
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
    async query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        if (sql == 'show dbs') {
            this.client.db().admin().listDatabases().then((res) => {
                callback(null, res.databases.map((db: any) => ({ Database: db.name })))
                console.log(res)
            })
        } else {
            const result = await eval('this.client.'+sql)
            this.handleSearch(sql, result, callback)
        }
    }

    private async handleSearch(sql: any, data: any, callback: any) {
        let fields = null;

        let rows = data.map((document: any) => {
            if (!fields) {
                fields = [];
                for (const key in document) {
                    fields.push({ name: key, type: 'text', nullable: 'YES' });
                }
            }
            let row = {};
            for (const key in document) {
                row[key] = document[key];
                if (row[key] instanceof Object) {
                    row[key] = JSON.stringify(row[key]);
                }
            }
            return row;
        });
        // if (!fields) {
        //     const indexName = path.split('/')[1];
        //     const indexNode = Node.nodeCache[`${this.opt.getConnectId()}_${indexName}`] as Node;
        //     fields = (await indexNode?.getChildren())?.map((node: any) => { return { name: node.label, type: node.type, nullable: 'YES' }; }) as any;
        // }
        callback(null, rows, fields);
    }

}