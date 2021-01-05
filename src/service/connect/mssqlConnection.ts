import { Node } from "@/model/interface/node";
import { Connection, Request } from "tedious";
import { IConnection, queryCallback } from "./connection";

export class MSSqlConnnection implements IConnection {
    private con: Connection;
    constructor(private opt: Node) { }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        let fields = null;
        let datas = [];
        this.init()
        this.con.on("connect",err=>{
            if(err){
                callback(err)
                return;
            }
            this.con.execSql(new Request(sql, err => {
                if (err) {
                    callback(err, null)
                } else {
                    callback(null, datas, fields)
                    this.end()
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
        })
    }
    connect(callback: (err: Error) => void): void {
        callback(null)
    }
    init(){
        const opt=this.opt;
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
    beginTransaction(callback: (err: Error) => void): void {
        this.init()
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
    /**
     * Always create new connections
     */
    isAlive(): boolean {
        return false;
    }

}