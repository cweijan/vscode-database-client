import { Node } from "@/model/interface/node";
import { Connection, Request } from "tedious";
import { IConnection, queryCallback } from "./connection";
var ConnectionPool = require('./mssql/connection-pool');

/**
 * http://tediousjs.github.io/tedious/getting-started.html
 * 3. column相关语句适配
 * 4. user适配
 * 5. 表、列增加注释
 */
export class MSSqlConnnection implements IConnection {
    private pool;
    private inTrans: boolean = false;
    private inTransConn: Connection;
    constructor(private opt: Node) {
        this.init()
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        let fields = [];
        let datas = [];
        this.getConnection().then(connection => {
            connection.execSql(new Request(sql, err => {
                if (err) {
                    callback(err, null)
                } else {
                    callback(null, datas, fields)
                }
                if(!this.inTrans){
                    this.pool.release(connection)
                }
            }).on('columnMetadata', (columns) => {
                columns.forEach((column) => {
                    fields.push({
                        name: column.colName,
                        orgTable: ((column) as any).tableName
                    })
                });
            }).on('row', columns => {
                let temp = {};
                columns.forEach((column) => {
                    temp[column.metadata.colName] = column.value
                });
                datas.push(temp)
            }))
        }).catch(callback)
    }
    connect(callback: (err: Error) => void): void {
        this.pool.acquire(function (err, connection) {
            if (err) {
                callback(err)
                return;
            }
            callback(null)
            connection.release();
        });
    }
    init() {
        const opt = this.opt;
        this.pool = new ConnectionPool(
            { min: 2, max: 10, log: true },
            {
                server: opt.host,
                options: {
                    database: opt.database || undefined,
                    connectTimeout: 10000,
                    requestTimeout: 10000,
                },
                authentication: {
                    type: "default",
                    options: {
                        userName: opt.user,
                        password: opt.password,
                    }
                }
            }
        );
    }
    getConnection(): Promise<any> {
        return new Promise((res, rej) => {
            if (this.inTrans) {
                res(this.inTransConn)
                return;
            }
            this.pool.acquire((err, connection) => {
                if (err) {
                    rej(err)
                } else {
                    res(connection)
                }
            });
        });
    }
    async beginTransaction(callback: (err: Error) => void) {
        if (this.inTrans) return;
        const conn = (await this.getConnection());
        conn.beginTransaction(callback)
        this.inTransConn = conn
        this.inTrans = true;
    }
    async rollback() {
        if(this.inTrans){
            this.inTransConn.commitTransaction(null)
            this.inTrans = false;
            this.pool.release(this.inTransConn)
        }
    }
    async commit() {
        if(this.inTrans){
            this.inTransConn.commitTransaction(null)
            this.inTrans = false;
            this.pool.release(this.inTransConn)
        }
    }
    end(): void {
        this.pool.drain()
    }
    isAlive(): boolean {
        return true;
    }

}