import { Node } from "@/model/interface/node";
import { Client } from "pg";
import { IConnection, queryCallback } from "./connection";

export class PostgreSqlConnection implements IConnection {
    private client: Client;
    constructor(opt: Node) {
        this.client = new Client({
            host: opt.host, port: opt.port,
            user: opt.user, password: opt.password,
            database: opt.database
        });
    }
    isAlive(): boolean {
        // return this.con.state == 'authenticated' || this.con.authorized
        return false;
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        /**
         * convert result value
         */
        this.client.query(sql, values, callback)
    }
    connect(callback: (err: Error) => void): void {
        this.client.connect(callback)
    }
    async beginTransaction() {
        await this.client.query("BEGIN")
    }
    async rollback() {
        await this.client.query("ROLLBACK")
    }
    async commit() {
        await this.client.query("COMMIT")
    }
    end(): void {
        this.client.end()
    }

}