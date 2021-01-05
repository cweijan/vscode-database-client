import { Node } from "@/model/interface/node";
import * as fs from "fs";
import * as mysql from "mysql2";
import { IConnection, queryCallback } from "./connection";

export class MysqlConnection implements IConnection {
    private con: mysql.Connection;
    constructor(opt: Node) {
        const newConnectionOptions = {
            host: opt.host, port: opt.port, user: opt.user, password: opt.password, database: opt.database,
            timezone: opt.timezone,
            multipleStatements: true, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true,

        } as mysql.ConnectionConfig;
        if (opt.certPath && fs.existsSync(opt.certPath)) {
            newConnectionOptions.ssl = {
                ca: fs.readFileSync(opt.certPath),
            };
        }
        this.con = mysql.createConnection(newConnectionOptions);
    }
    isAlive(): boolean {
        return this.con.state == 'authenticated' || this.con.authorized
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        this.con.query(sql, values, callback)
    }
    connect(callback: (err: Error) => void): void {
        this.con.connect(callback)
    }
    beginTransaction(callback: (err: Error) => void): void {
        this.con.beginTransaction(callback)
    }
    rollback(): void {
        this.con.rollback()
    }
    commit(): void {
        this.con.commit()
    }
    end(): void {
        this.con.end()
    }

}