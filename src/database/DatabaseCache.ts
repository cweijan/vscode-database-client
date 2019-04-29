import { DatabaseNode } from "../model/DatabaseNode";
import { TableNode } from "../model/TableNode";
import { ColumnNode } from "../model/ColumnNode";
import { ExtensionContext, TreeItemCollapsibleState } from "vscode";
import { CacheKey, ModelType } from "../common/Constants";
import { INode } from "../model/INode";

export class DatabaseCache {

    private static context: ExtensionContext;
    private static connectionNodeMapDatabaseNode = {};
    private static databaseNodeMapTableNode = {};
    private static tableNodeMapColumnNode = {};
    private static collpaseState: { key?: TreeItemCollapsibleState };

    static evictAllCache(): any {
        if (this.context == null) throw new Error("DatabaseCache is not init!")
        this.context.globalState.update(CacheKey.DatabaseCacheKey, undefined)
        this.context.globalState.update(CacheKey.DatabaseColumnCacheKey, undefined)
        this.context.globalState.update(CacheKey.DatabaseTableCacheKey, undefined)
        this.connectionNodeMapDatabaseNode = [];
        this.databaseNodeMapTableNode = {};
        this.tableNodeMapColumnNode = {};
    }

/**
     * support to complection manager
     */
    static getDatabaseNodeList(): DatabaseNode[] {
        let databaseNodeList = [];

        Object.keys(this.connectionNodeMapDatabaseNode).forEach(key => {
            let tempList = this.connectionNodeMapDatabaseNode[key]
            if (tempList) {
                databaseNodeList = databaseNodeList.concat(tempList)
            }
        })

        return databaseNodeList;
    }

    /**
     * support to complection manager
     */
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

    /**
     * get element current collapseState or default collapseState
     * @param element 
     */
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
        } else if (element.type == ModelType.CONNECTION) {
            return TreeItemCollapsibleState.Expanded
        } else {
            return TreeItemCollapsibleState.Collapsed
        }

    }


    /**
     * update tree node collapseState
     * @param element 
     * @param collapseState 
     */
    static storeElementState(element?: INode, collapseState?: TreeItemCollapsibleState) {

        if (!element || !collapseState) {
            this.context.globalState.update(CacheKey.CollapseSate, this.collpaseState)
        }

        if (element.type == ModelType.COLUMN || element.type == ModelType.INFO) {
            return;
        }

        this.collpaseState[element.identify] = collapseState

    }

    /**
     * recovery all data
     */
    static obtainStoreCache() {
        if (this.context == null) throw new Error("DatabaseCache is not init!")
        let cached = false
        if (this.context.globalState.get(CacheKey.DatabaseCacheKey)) {
            cached = true
            const c: { [datbaseName: string]: DatabaseProxy[] } = this.context.globalState.get(CacheKey.DatabaseCacheKey)
            const databaseProxyList: DatabaseProxy[] = this.context.globalState.get(CacheKey.DatabaseCacheKey)
            Object.keys(c).forEach(cn => {
                if (!this.connectionNodeMapDatabaseNode[cn]) {
                    this.connectionNodeMapDatabaseNode[cn] = []
                }
                c[cn].forEach(tableProxy => {
                    const databaseNode = new DatabaseNode(tableProxy.host, tableProxy.user, tableProxy.password, tableProxy.port, tableProxy.database, tableProxy.certPath)
                    this.connectionNodeMapDatabaseNode[cn].push(databaseNode)
                })
            })
        }
        if (this.context.globalState.get(CacheKey.DatabaseTableCacheKey)) {
            cached = true
            const t: { [datbaseName: string]: TableProxy[] } = this.context.globalState.get(CacheKey.DatabaseTableCacheKey)
            Object.keys(t).forEach(dn => {
                if (!this.databaseNodeMapTableNode[dn]) {
                    this.databaseNodeMapTableNode[dn] = []
                }
                t[dn].forEach(tableProxy => {
                    const tableNode = new TableNode(tableProxy.host, tableProxy.user, tableProxy.password, tableProxy.port, tableProxy.database, tableProxy.table, tableProxy.certPath)
                    this.databaseNodeMapTableNode[dn].push(tableNode)
                })
            })
        }
        if (this.context.globalState.get(CacheKey.DatabaseColumnCacheKey)) {
            cached = true
            const c: { [tableName: string]: ColumnProxy[] } = this.context.globalState.get(CacheKey.DatabaseColumnCacheKey)
            Object.keys(c).forEach(tn => {
                if (!this.tableNodeMapColumnNode[tn]) {
                    this.tableNodeMapColumnNode[tn] = []
                }
                c[tn].forEach(columnProxy => {
                    this.tableNodeMapColumnNode[tn].push(new ColumnNode(columnProxy.host, columnProxy.user, columnProxy.password, columnProxy.port, columnProxy.database, columnProxy.table, columnProxy.certPath, columnProxy.column))
                })

            })
        }

        return cached
    }

    /**
     * cache init, Mainly initializing context object
     * @param context 
     */
    static initCache(context: ExtensionContext) {
        this.context = context;
        //每30秒保存当前折叠状态
        setInterval(() => {
            this.storeElementState()
        }, 30000)
    }

    /**
     * store sql tree data
     */
    static storeCurrentCache() {
        if (this.context == null) throw new Error("DatabaseCache is not init!")
        this.context.globalState.update(CacheKey.DatabaseCacheKey, this.connectionNodeMapDatabaseNode)
        this.context.globalState.update(CacheKey.DatabaseTableCacheKey, this.databaseNodeMapTableNode)
        this.context.globalState.update(CacheKey.DatabaseColumnCacheKey, this.tableNodeMapColumnNode)
    }

    /**
     * clear database data for connection
     * @param connectionIdentify 
     */
    static clearDatabaseCache(connectionIdentify?: string) {
        if (connectionIdentify) {
            delete this.connectionNodeMapDatabaseNode[connectionIdentify]
        } else {
            this.connectionNodeMapDatabaseNode = {}
        }
    }

    /**
     * clear table data for database
     * @param databaseIdentify 
     */
    static clearTableCache(databaseIdentify?: string) {
        if (databaseIdentify) {
            delete this.databaseNodeMapTableNode[databaseIdentify]
        } else {
            this.databaseNodeMapTableNode = {}
        }
    }

    /**
     * claer column data for table
     * @param tableIdentify 
     */
    static clearColumnCache(tableIdentify?: string) {
        if (tableIdentify) {
            delete this.tableNodeMapColumnNode[tableIdentify]
        } else {
            this.tableNodeMapColumnNode = {}
        }
    }

    /**
     * get connectino tree data
     * @param connectcionIdentify 
     */
    static getDatabaseListOfConnection(connectcionIdentify: string): DatabaseNode[] {
        if (this.connectionNodeMapDatabaseNode[connectcionIdentify]) {
            return this.connectionNodeMapDatabaseNode[connectcionIdentify]
        } else {
            return null
        }
    }

    /**
     * get database tree data
     * @param databaseName 
     */
    static getTableListOfDatabase(databaseName: string): TableNode[] {
        if (this.databaseNodeMapTableNode[databaseName]) {
            return this.databaseNodeMapTableNode[databaseName]
        } else {
            return null
        }
    }

    /**
     * get table tree data
     * @param tableName 
     */
    static getColumnListOfTable(tableName: string): ColumnNode[] {
        if (this.tableNodeMapColumnNode[tableName]) {
            return this.tableNodeMapColumnNode[tableName]
        } else {
            return null
        }
    }

    static setDataBaseListOfConnection(connectionIdentify: string, DatabaseNodeList: DatabaseNode[]) {
        this.connectionNodeMapDatabaseNode[connectionIdentify] = DatabaseNodeList
    }

    static setTableListOfDatabase(databaseIdentify: string, tableNodeList: TableNode[]) {
        this.databaseNodeMapTableNode[databaseIdentify] = tableNodeList
    }

    static setColumnListOfTable(tableIdentify: string, columnList: ColumnNode[]) {
        this.tableNodeMapColumnNode[tableIdentify] = columnList
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
    port: string; database: string; table: string;
    certPath: string; column: any
}