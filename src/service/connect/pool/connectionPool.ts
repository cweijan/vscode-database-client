import { EventEmitter } from "events";
import { IpoolConnection, pcStatus } from "./poolConnection";

export interface IPoolConfig {
    min: number;
    max: number;
}

export abstract class ConnectionPool<T> {
    private connections: IpoolConnection<T>[] = [];
    private conneted: boolean;
    private waitQueue: Function[] = [];

    constructor() {
    }

    public async getConnection(callback?: (connection: IpoolConnection<T>) => void) {
        for (let i = 0; i < this.connections.length; i++) {
            const connection = this.connections[i];
            if (connection && connection.status == pcStatus.FREE) {
                if (callback)
                    callback(connection)
                connection.status = pcStatus.BUSY
                return connection
            }
        }
        this.waitQueue.push(callback)
        this.fill(true)
    }


    public isAlive(): boolean {
        return this.conneted;
    }

    public async fill(usingMax?: boolean) {
        this.conneted = true;
        const config: IPoolConfig = { min: 2, max: 5 }
        const amount = usingMax ? config.max : config.min
        for (let i = 0; i < amount; i++) {
            if (this.connections[i]) continue;
            const poolConnection = new IpoolConnection<T>(i, pcStatus.PEENDING);
            this.connections.push(poolConnection)
            this.createConnection(poolConnection)
        }
    }
    private createConnection(poolConnection: IpoolConnection<T>): void {
        try {
            this.newConnection((err, con) => {
                if (err) {
                    this.createConnection(poolConnection)
                    return;
                }
                poolConnection.actual = con
                if (con instanceof EventEmitter) {
                    con.on("error", () => {
                         this.endConnnection(poolConnection) 
                        })
                    con.on("end", () => { 
                        this.endConnnection(poolConnection)
                     })
                }
                const waiter = this.waitQueue.shift()
                if (waiter) {
                    poolConnection.status = pcStatus.BUSY
                    waiter(poolConnection)
                } else {
                    poolConnection.status = pcStatus.FREE
                }
            })
        } catch (error) {
            this.createConnection(poolConnection)
        }
    }

    abstract newConnection(callback: (err: Error, connection: T) => void): void;
    public release(poolConnection: IpoolConnection<T>): void {
        poolConnection.status = pcStatus.FREE
        const waiter = this.waitQueue.shift()
        if (waiter) {
            poolConnection.status = pcStatus.BUSY
            waiter(poolConnection)
        }
    }
    public endConnnection(poolConnection: IpoolConnection<T>): void {
        try { (poolConnection.actual as any).end(); 
        } catch (error) { }
        delete this.connections[poolConnection.id];
    }
    public close() {
        for (let i = 0; i < this.connections.length; i++) {
            const con = this.connections[i];
            (con.actual as any).end()
        }
    }
}