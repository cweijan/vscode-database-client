import axios from "axios";
import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";

export class EsConnection implements IConnection {

    private url: string;
    private conneted: boolean;
    constructor(opt: Node) {
        this.url = `${opt.scheme}://${opt.host}:${opt.port}`
    }

    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        throw new Error("Method not implemented.");
    }
    connect(callback: (err: Error) => void): void {
        axios.get(`${this.url}/_cluster/health`).then(res => {
            this.conneted = true;
            callback(null)
        }).catch(err => {
            callback(err)
        })

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
        return this.conneted;
    }

}