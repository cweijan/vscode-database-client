import { Node } from "@/model/interface/node";
import * as fs from "fs";
import * as mysql from "mysql2";
import { SslOptions } from "mysql2";
import { IConnection, queryCallback } from "./connection";
import { dumpTypeCast } from './convert/mysqlTypeCast';

export class MysqlConnection extends IConnection {
    private con: mysql.Connection;
    constructor(node: Node) {
        super()
        if (node.useConnectionString) {
            this.con = mysql.createConnection(node.connectionUrl);
            return;
        }
        this.con = mysql.createConnection({
            host: node.host, port: node.port, user: node.user, password: node.password, database: node.database,
            timezone: node.timezone,
            multipleStatements: true, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true,
            connectTimeout: node.connectTimeout || 5000,
            socketPath: node.socketPath,
            insecureAuth: true,
            authPlugins: {
                mysql_clear_password: () => () => {
                    return Buffer.from(node.password + '\0')
                }
            },
            typeCast: (field, next) => {
                if (this.dumpMode) return dumpTypeCast(field)
                const buf = field.buffer();
                if (field.type == 'BIT') {
                    return this.bitToBoolean(buf)
                }
                return buf?.toString();
            },
            ssl: node.useSSL ? {
                rejectUnauthorized: false,
                ca: (node.caPath) ? fs.readFileSync(node.caPath, 'utf8') : null,
                cert: (node.clientCertPath) ? fs.readFileSync(node.clientCertPath, 'utf8') : null,
                key: (node.clientKeyPath) ? fs.readFileSync(node.clientKeyPath, 'utf8') : null,
                minVersion: 'TLSv1'
            } as SslOptions as any : undefined
        });
    }
    isAlive(): boolean {
        return !this.dead && this.con.authorized
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        return this.con.query(sql, values, callback)
    }
    connect(callback: (err: Error) => void): void {
        this.con.connect(callback)
        this.con.on("error", () => {
            this.dead = true;
        })
        this.con.on("end", () => {
            this.dead = true;
        })
    }
    beginTransaction(callback: (err: Error) => void): void {
        this.con.beginTransaction(callback)
    }
    rollback(): void {
        this.con.rollback(() => { })
    }
    commit(): void {
        this.con.commit()
    }
    end(): void {
        this.dead = true;
        this.con.end()
    }

    bitToBoolean(buf: Buffer): any {
        return buf ? buf[0] == 1 : null;
    }

}