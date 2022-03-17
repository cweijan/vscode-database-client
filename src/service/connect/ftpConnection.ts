import { Node } from "@/model/interface/node";
import EventEmitter = require("events");
import { IConnection, queryCallback } from "./connection";
import Client from '@/model/ftp/lib/connection'

export class FTPConnection extends IConnection {

    private client:  Client;
    constructor(private node: Node) {
        super()
        this.client = new Client();
    }

    public getClient():Client{
        return this.client;
    }

    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any) {
        throw new Error("Method not implemented.");
    }
    connect(callback: (err: Error) => void): void {
        const client = this.client;
        client.on('ready', function () {
            callback(null)
        });
        client.on('error', (err: Error) => {
            callback(err)
        })
        client.on('close', () => {
            this.dead = true;
        })
        client.connect({
            host: this.node.host,
            port: this.node.port,
            user: this.node.user,
            password: this.node.password,
            encoding:this.node.encoding,
            secure: false,
            connTimeout: this.node.connectTimeout||3000,
            pasvTimeout: this.node.requestTimeout
        });
    }
    beginTransaction(callback: (err: Error) => void): void {
        throw new Error("Method not implemented.");
    }
    rollback(): void {
        throw new Error("Method not implemented.");
    }
    commit(): void {
        throw new Error("Method not implemented.");
    }
    end(): void {
    }
    isAlive(): boolean {
        return true;
    }

}