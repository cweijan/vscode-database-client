import { Node } from "@/model/interface/node";
import { Client, ClientConfig, QueryArrayResult } from "pg";
import { IConnection, queryCallback } from "./connection";
import { ConnectionPool } from "./pool/connectionPool";

export class PostgreSqlConnection extends ConnectionPool<Client> implements IConnection {
    private config: ClientConfig;
    constructor(opt: Node) {
        super()
        this.config = {
            host: opt.host, port: opt.port,
            user: opt.user, password: opt.password,
            database: opt.database,
            connectionTimeoutMillis: 5000,
            statement_timeout: 10000,
        };
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    async query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        this.getConnection(connection => {
            connection.actual.query(sql, (err, res) => {
                this.release(connection)
                if (err) {
                    callback(err)
                } else {
                    if (res instanceof Array) {
                        callback(null, res.map(row => this.adaptResult(row)), res.map(row => row.fields))
                    } else {
                        callback(null, this.adaptResult(res), res.fields)
                    }
                }
            })
        });
    }

    connect(callback: (err: Error) => void): void {
        const client = new Client(this.config);
        client.connect(err => {
            callback(err)
            client.end()
            if (!err) {
                this.fill()
            }
        })
    }
    async beginTransaction() {
        const connection = await this.getConnection();
        await connection.actual.query("BEGIN")
        this.release(connection)
    }
    async rollback() {
        const connection = await this.getConnection();
        await connection.actual.query("ROLLBACK")
        this.release(connection)
    }
    async commit() {
        const connection = await this.getConnection();
        await connection.actual.query("COMMIT")
        this.release(connection)
    }

    private adaptResult(res: QueryArrayResult<any>) {
        if (res.command != 'SELECT') {
            return { affectedRows: res.rowCount }
        }
        return res.rows;
    }

    protected newConnection(callback: (err: Error, connection: Client) => void) {
        const client = new Client(this.config);
        client.connect(err => {
            callback(err, client)
        })
    }

}