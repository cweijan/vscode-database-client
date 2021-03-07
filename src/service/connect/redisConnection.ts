import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";

import * as IoRedis from "ioredis";

export class RedisConnection extends IConnection {
    private conneted: boolean;
    private client: IoRedis.Redis;
    constructor(opt: Node) {
        super()
        this.client = new IoRedis({
            port: opt.port, 
            host: opt.host,
            password: opt.password,
            connectTimeout: opt.connectTimeout || 5000,
            db: opt.database as any as number,
            family: 4, // 4 (IPv4) or 6 (IPv6)
        });


    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        const param: string[] = sql.replace(/ +/g, " ").split(' ')
        const command = param.shift()
        this.client.send_command(command, param, callback)
    }
    run(callback: (client: IoRedis.Redis) => void) {

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