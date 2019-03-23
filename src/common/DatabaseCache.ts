import { DatabaseNode } from "../model/databaseNode";
import { TableNode } from "../model/tableNode";
import { ColumnNode } from "../model/columnNode";
import { ExtensionContext } from "vscode";
import { Constants } from "./constants";
import { OutputChannel } from "./outputChannel";

export class DatabaseCache {

    private static context;

    static evictAllCache(): any {
        if(this.context==null)throw new Error("DatabaseCache is not init!")
        this.context.globalState.update(Constants.DatabaseCacheKey, undefined)
        this.context.globalState.update(Constants.DatabaseColumnCacheKey, undefined)
        this.context.globalState.update(Constants.DatabaseTableCacheKey, undefined)
        this.databaseNodes = [];
        this.databaseNodeMapTableNode = {};
        this.tableNodeMapColumnNode = {};
    }

    static databaseNodes: DatabaseNode[] = [];
    private static databaseNodeMapTableNode = {};
    private static tableNodeMapColumnNode = {};

    static getTableNodeList(): TableNode[] {
        let tableNodeList = [];

        Object.keys(this.databaseNodeMapTableNode).forEach(key => {
            let tempList = this.databaseNodeMapTableNode[key]
            if (tempList) {
                tableNodeList = tableNodeList.concat(tempList)
            }
        })

        return tableNodeList;
    }

    static obtainStoreCache() {
        if(this.context==null)throw new Error("DatabaseCache is not init!")
        let cached = false
        if (this.context.globalState.get(Constants.DatabaseCacheKey)) {
            const databaseProxyList :DatabaseProxy[]= this.context.globalState.get(Constants.DatabaseCacheKey)
            databaseProxyList.forEach(d => {
                this.databaseNodes.push(new DatabaseNode(d.host, d.user, d.password, d.port, d.database, d.certPath))
            })
        }
        if (this.context.globalState.get(Constants.DatabaseTableCacheKey)) {
            const t: { [datbaseName: string]: TableProxy[] } = this.context.globalState.get(Constants.DatabaseTableCacheKey)
            Object.keys(t).forEach(dn => {
                if (!this.databaseNodeMapTableNode[dn]) {
                    this.databaseNodeMapTableNode[dn] = []
                }
                t[dn].forEach(tableProxy=>{
                    this.databaseNodeMapTableNode[dn].push(new TableNode(tableProxy.host, tableProxy.user, tableProxy.password, tableProxy.port, tableProxy.database, tableProxy.table, tableProxy.certPath))                    
                })

            })
        }
        if (this.context.globalState.get(Constants.DatabaseColumnCacheKey)) {
            const c:{ [tableName: string]: ColumnProxy[] } = this.context.globalState.get(Constants.DatabaseColumnCacheKey)
            Object.keys(c).forEach(tn => {
                if (!this.tableNodeMapColumnNode[tn]) {
                    this.tableNodeMapColumnNode[tn] = []
                }
                c[tn].forEach(columnProxy=>{
                    this.tableNodeMapColumnNode[tn].push(new ColumnNode(columnProxy.host, columnProxy.user, columnProxy.password, columnProxy.port, columnProxy.database, columnProxy.column))
                })
                
            })
        }

        if (this.databaseNodes.length > 1) {
            cached = true
        }

        return cached
    }

    static initCache(context: ExtensionContext) {
        this.context = context;
    }

    static storeCurrentCache() {
        OutputChannel.appendLine("store")
        if(this.context==null)throw new Error("DatabaseCache is not init!")
        this.context.globalState.update(Constants.DatabaseCacheKey, this.databaseNodes)
        this.context.globalState.update(Constants.DatabaseTableCacheKey, this.databaseNodeMapTableNode)
        this.context.globalState.update(Constants.DatabaseColumnCacheKey, this.tableNodeMapColumnNode)
    }

    static getTableListOfDatabase(databaseName: string): TableNode[] {
        if (this.databaseNodeMapTableNode[databaseName]) {
            return this.databaseNodeMapTableNode[databaseName]
        } else {
            return []
        }
    }

    static getColumnListOfTable(tableName: string): ColumnNode[] {
        if (this.tableNodeMapColumnNode[tableName]) {
            return this.tableNodeMapColumnNode[tableName]
        } else {
            return []
        }


    }

    static setTableListOfDatabase(databaseName: string, tableNodeList: TableNode[]) {
        this.databaseNodeMapTableNode[databaseName] = tableNodeList
    }

    static setColumnListOfTable(tableName: string, columnList: ColumnNode[]) {
        this.tableNodeMapColumnNode[tableName] = columnList
    }


}


class DatabaseProxy {
    host: string; user: string; password: string;
    port: string; database: string; certPath: string
}

class TableProxy {
    host: string; user: string; password: string;
    port: string; database: string; table: string;
    certPath: string
}

class ColumnProxy {
    host: string; user: string; password: string;
    port: string; database: string; column: any
}