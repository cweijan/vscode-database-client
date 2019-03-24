import { DatabaseNode } from "../model/databaseNode";
import { TableNode } from "../model/tableNode";
import { ColumnNode } from "../model/columnNode";
import { ExtensionContext, TreeItemCollapsibleState } from "vscode";
import { CacheKey, ModelType } from "./constants";
import { OutputChannel } from "./outputChannel";
import { INode } from "../model/INode";

export class DatabaseCache {

    private static context: ExtensionContext;
    static databaseNodes: DatabaseNode[] = [];
    private static databaseNodeMapTableNode = {};
    private static tableNodeMapColumnNode = {};
    private static collpaseState;

    static evictAllCache(): any {
        if (this.context == null) throw new Error("DatabaseCache is not init!")
        this.context.globalState.update(CacheKey.DatabaseCacheKey, undefined)
        this.context.globalState.update(CacheKey.DatabaseColumnCacheKey, undefined)
        this.context.globalState.update(CacheKey.DatabaseTableCacheKey, undefined)
        this.databaseNodes = [];
        this.databaseNodeMapTableNode = {};
        this.tableNodeMapColumnNode = {};

    }

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

    static getElementState(element?: INode) {

        if (element.type == ModelType.COLUMN || element.type == ModelType.INFO) {
            return TreeItemCollapsibleState.None
        }

        if (!this.collpaseState || Object.keys(this.collpaseState).length == 0) {
            this.collpaseState = this.context.globalState.get(CacheKey.CollapseSate)
        }

        if (!this.collpaseState) {
            this.collpaseState = {};
        }

        if (this.collpaseState[element.identify]) {
            return this.collpaseState[element.identify]
        } else {
            return TreeItemCollapsibleState.Collapsed
        }

    }

    static storeElementState(element?: INode, collapseState?: TreeItemCollapsibleState) {

        if (!element || !collapseState) {
            this.context.globalState.update(CacheKey.CollapseSate, this.collpaseState)
        }

        if (element.type == ModelType.COLUMN || element.type == ModelType.INFO) {
            return;
        }

        this.collpaseState[element.identify] = collapseState

    }

    static obtainStoreCache() {
        if (this.context == null) throw new Error("DatabaseCache is not init!")
        let cached = false
        if (this.context.globalState.get(CacheKey.DatabaseCacheKey)) {
            const databaseProxyList: DatabaseProxy[] = this.context.globalState.get(CacheKey.DatabaseCacheKey)
            databaseProxyList.forEach(d => {
                this.databaseNodes.push(new DatabaseNode(d.host, d.user, d.password, d.port, d.database, d.certPath))
            })
        }
        if (this.context.globalState.get(CacheKey.DatabaseTableCacheKey)) {
            const t: { [datbaseName: string]: TableProxy[] } = this.context.globalState.get(CacheKey.DatabaseTableCacheKey)
            Object.keys(t).forEach(dn => {
                if (!this.databaseNodeMapTableNode[dn]) {
                    this.databaseNodeMapTableNode[dn] = []
                }
                t[dn].forEach(tableProxy => {
                    this.databaseNodeMapTableNode[dn].push(new TableNode(tableProxy.host, tableProxy.user, tableProxy.password, tableProxy.port, tableProxy.database, tableProxy.table, tableProxy.certPath))
                })

            })
        }
        if (this.context.globalState.get(CacheKey.DatabaseColumnCacheKey)) {
            const c: { [tableName: string]: ColumnProxy[] } = this.context.globalState.get(CacheKey.DatabaseColumnCacheKey)
            Object.keys(c).forEach(tn => {
                if (!this.tableNodeMapColumnNode[tn]) {
                    this.tableNodeMapColumnNode[tn] = []
                }
                c[tn].forEach(columnProxy => {
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
        setInterval(() => {
            this.storeElementState()
        }, 30000)
    }

    static storeCurrentCache() {
        OutputChannel.appendLine("store")
        if (this.context == null) throw new Error("DatabaseCache is not init!")
        this.context.globalState.update(CacheKey.DatabaseCacheKey, this.databaseNodes)
        this.context.globalState.update(CacheKey.DatabaseTableCacheKey, this.databaseNodeMapTableNode)
        this.context.globalState.update(CacheKey.DatabaseColumnCacheKey, this.tableNodeMapColumnNode)
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