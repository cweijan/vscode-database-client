import { Node } from "@/model/interface/node";
import { Connection, Request } from "tedious";
import { IConnection, queryCallback } from "./connection";

export class MSSqlConnnection implements IConnection {
    private con: Connection;
    constructor(opt: Node) {
        this.con = new Connection({
            server: opt.host,
            options: {
            },
            authentication: {
                type: "default",
                options: {
                    userName: opt.user,
                    password: opt.password,
                }
            }
        });
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        let fields = null;
        let datas = [];
        this.con.execSql(new Request(sql, err => {
            if (err) {
                callback(err, null)
            } else {
                callback(null, datas, fields)
            }
        }).on('row', columns => {
            if (!fields) {
                fields = [];
                columns.forEach(function (column) {
                    fields.push({
                        name: column.metadata.colName,
                        orgTable: ((column.metadata) as any).tableName
                    })
                });
            }
            let temp = {};
            columns.forEach(function (column) {
                temp[column.metadata.colName] = column.value
            });
            datas.push(temp)
        }))
    }
    connect(callback: (err: Error) => void): void {
        this.con.connect(callback)
    }
    beginTransaction(callback: (err: Error) => void): void {
        this.con.beginTransaction(callback)
    }
    rollback(): void {
        this.con.rollbackTransaction(null)
    }
    commit(): void {
        this.con.commitTransaction(null)
    }
    end(): void {
        this.con.close()
    }
    isAlive(): boolean {
        const temp = this.con as any;
        return temp.loggedIn && !temp.closed;
    }

}