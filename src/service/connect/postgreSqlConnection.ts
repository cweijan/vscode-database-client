import { Node } from "@/model/interface/node";
import { Client, QueryArrayResult, types } from "pg";
import { IConnection, queryCallback } from "./connection";
import { TypeId } from "pg-types";
import { EventEmitter } from "events";
import * as sqlstring from 'sqlstring';

// date
types.setTypeParser(1082, (val) => val)
// json
types.setTypeParser(114, (val) => val)

/**
 * https://www.npmjs.com/package/pg
 */
export class PostgreSqlConnection extends IConnection {
    private client: Client;
    constructor(opt: Node) {
        super()
        const config = {
            host: opt.host, port: opt.port,
            user: opt.user, password: opt.password,
            database: opt.database,
            connectionTimeoutMillis: 5000,
            statement_timeout: 10000
        };
        this.client = new Client(config);

    }
    isAlive(): boolean {
        const temp = this.client as any;
        return !this.dead && temp._connected && !temp._ending && temp._queryable;
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {

        if (!callback && values instanceof Function) {
            callback = values;
        }
        const event = new EventEmitter()
        this.client.query(sql, (err, res) => {
            if (err) {
                callback(err)
                this.end()
                event.emit("error", err.message)
            } else if (!callback) {
                if (res.rows.length == 0) {
                    event.emit("end")
                }
                for (let i = 1; i <= res.rows.length; i++) {
                    const row = res.rows[i-1];
                    event.emit("result", this.convertToDump(res.fields, row),res.rows.length == i)
                }
            } else {
                if (res instanceof Array) {
                    callback(null, res.map(row => this.adaptResult(row)), res.map(row => row.fields))
                } else {
                    callback(null, this.adaptResult(res), res.fields)
                }
            }
        })
        return event;
    }
    convertToDump(fields: import("pg").FieldDef[], row: any): any {
        for (const key in row) {
            const element = row[key];
            if (!element) {
                row[key] = 'NULL'
            }else{
                row[key]=sqlstring.escape(element)
            }
        }
        return row;
    }
    adaptResult(res: QueryArrayResult<any>) {
        if (res.command != 'SELECT' && res.command != 'SHOW') {
            return { affectedRows: res.rowCount }
        }
        return res.rows;
    }

    connect(callback: (err: Error) => void): void {
        this.client.connect(err => {
            callback(err)
            if (!err) {
                this.client.on("error", this.end)
                this.client.on("end", this.end)
            }
        })
    }
    async beginTransaction(callback: (err: Error) => void) {
        this.client.query("BEGIN", callback)
    }
    async rollback() {
        await this.client.query("ROLLBACK")
    }
    async commit() {
        await this.client.query("COMMIT")
    }
    end(): void {
        this.dead = true;
        this.client.end()
    }



}