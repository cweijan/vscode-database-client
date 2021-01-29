import { Node } from "@/model/interface/node";
import { RedisClient, createClient } from "redis";
import { IConnection, queryCallback } from "./connection";

export class RedisConnection extends IConnection {
    private conneted: boolean;
    private client: RedisClient;
    constructor(opt: Node) {
        super()
        this.client = createClient({
            host: opt.host,
            port: opt.port,
            db: opt.database,
            auth_pass: opt.password,
            connect_timeout: opt.connectTimeout || 5000
        })

    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        const param: string[] = sql.replace(/ +/g, " ").split(' ')
        const command = param.shift()
        this.client.send_command(command, param, callback)
    }
    run(callback: (client: RedisClient) => void) {

        callback(this.client)
    }

    connect(callback: (err: Error) => void): void {
        let timeout = true;
        setTimeout(() => {
            if (timeout) {
                timeout = false;
                callback(new Error("Connect to redis server time out."))
            }
        }, 5000);
        this.client.ping(() => {
            if (timeout) {
                this.conneted = true;
                timeout = false;
                callback(null)
            }
        })
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

}