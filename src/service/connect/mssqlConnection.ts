import { Node } from "@/model/interface/node";
import { Connection, ConnectionConfig, Request } from "tedious";
import { IConnection, queryCallback } from "./connection";
import { ConnectionPool } from "./pool/connectionPool";
import format = require('date-format');

/**
 * tedious not support connection queue, so need using pool.
 * http://tediousjs.github.io/tedious/getting-started.html
 */
export class MSSqlConnnection extends ConnectionPool<Connection> implements IConnection {
    private config: ConnectionConfig;
    constructor(node: Node) {
        super()
        this.config = {
            server: node.host,
            options: {
                database: node.database || undefined,
                connectTimeout: 10000,
                requestTimeout: 10000,
            },
            authentication: {
                type: "default",
                options: {
                    userName: node.user,
                    password: node.password,
                }
            }
        };
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    async query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        let fields = [];
        let datas = [];

        this.getConnection(poolConnection => {

            const connection = poolConnection.actual;

            const isSelect = sql.match(/^\s*\bselect\b/i)
            connection.execSql(new Request(sql, err => {
                if (err) {
                    callback(err, null)
                } else if (isSelect) {
                    callback(null, datas, fields)
                } else {
                    callback(null, { affectedRows: datas.length })
                }
                this.release(poolConnection)
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
                    if (column.value instanceof Date) {
                        temp[column.metadata.colName] = format("yyyy-MM-dd hh:mm:ss", column.value)
                    }
                });
                datas.push(temp)
            }))

        })
    }
    connect(callback: (err: Error) => void): void {
        const con = new Connection(this.config)
        con.on("connect", err => {
            callback(err)
            if (!err) {
                this.fill()
            }
        })
    }

    protected newConnection(callback: (err: Error, connection: Connection) => void): void {
        const connection = new Connection(this.config)
        connection.on("connect", err => {
            callback(err, connection)
        })
    }
    async beginTransaction(callback: (err: Error) => void) {
        const connection = await this.getConnection();
        connection.actual.beginTransaction((err) => {
            callback(err)
            this.release(connection)
        })
    }
    async rollback() {
        const connection = await this.getConnection();
        connection.actual.rollbackTransaction(() => {
            this.release(connection)
        })
    }
    async commit() {
        const connection = await this.getConnection();
        connection.actual.commitTransaction(() => {
            this.release(connection)
        })
    }
}