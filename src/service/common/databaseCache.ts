import { ExtensionContext, TreeItemCollapsibleState } from "vscode";
import { CacheKey, ModelType } from "../../common/constants";
import { ColumnNode } from "../../model/other/columnNode";
import { DatabaseNode } from "../../model/database/databaseNode";
import { Node } from "../../model/interface/node";
import { TableNode } from "../../model/main/tableNode";

export class DatabaseCache {

    private static context: ExtensionContext;
    private static connectionNodeMapDatabaseNode = {};
    private static databaseNodeMapTableNode = {};
    private static tableNodeMapColumnNode = {};
    private static collpaseState: { key?: TreeItemCollapsibleState };

    public static evictAllCache(): any {
        if (this.context == null) { throw new Error("DatabaseCache is not init!"); }
        this.connectionNodeMapDatabaseNode = [];
        this.databaseNodeMapTableNode = {};
        this.tableNodeMapColumnNode = {};
    }

    /**
     * support to complection manager
     */
    public static getDatabaseNodeList(): DatabaseNode[] {
        let databaseNodeList = [];

        Object.keys(this.connectionNodeMapDatabaseNode).forEach((key) => {
            const tempList = this.connectionNodeMapDatabaseNode[key];
            if (tempList) {
                databaseNodeList = databaseNodeList.concat(tempList);
            }
        });

        return databaseNodeList;
    }

    /**
     * support to complection manager
     */
    public static getTableNodeList(): TableNode[] {
        let tableNodeList = [];

        Object.keys(this.databaseNodeMapTableNode).forEach((key) => {
            const tempList = this.databaseNodeMapTableNode[key];
            if (tempList && (tempList[0] instanceof TableNode)) {
                tableNodeList = tableNodeList.concat(tempList);
            }
        });

        return tableNodeList;
    }

    /**
     * get element current collapseState or default collapseState
     * @param element 
     */
    public static getElementState(element?: Node) {

        if (!element.contextValue) {
            return TreeItemCollapsibleState.None
        }

        if (element.contextValue == ModelType.COLUMN || element.contextValue == ModelType.INFO || element.contextValue == ModelType.FUNCTION
            || element.contextValue == ModelType.TRIGGER || element.contextValue == ModelType.PROCEDURE || element.contextValue == ModelType.USER) {
            return TreeItemCollapsibleState.None;
        }

        if (!this.collpaseState || Object.keys(this.collpaseState).length == 0) {
            this.collpaseState = this.context.globalState.get(CacheKey.CollapseSate);
        }

        if (!this.collpaseState) {
            this.collpaseState = {};
        }

        if (element.id && this.collpaseState[element.id]) {
            return this.collpaseState[element.id];
        } else if (element.contextValue == ModelType.CONNECTION || element.contextValue == ModelType.TABLE_GROUP) {
            return TreeItemCollapsibleState.Expanded;
        } else {
            return TreeItemCollapsibleState.Collapsed;
        }

    }


    /**
     * update tree node collapseState
     * @param element 
     * @param collapseState 
     */
    public static storeElementState(element?: Node, collapseState?: TreeItemCollapsibleState) {

        if (element.contextValue == ModelType.COLUMN || element.contextValue == ModelType.INFO) {
            return;
        }

        this.collpaseState[element.id] = collapseState;
        this.context.globalState.update(CacheKey.CollapseSate, this.collpaseState);

    }

    /**
     * cache init, Mainly initializing context object
     * @param context 
     */
    public static initCache(context: ExtensionContext) {
        this.context = context;
    }

    /**
     * clear database data for connection
     * @param connectionid 
     */
    public static clearDatabaseCache(connectionid?: string) {
        if (connectionid) {
            delete this.connectionNodeMapDatabaseNode[connectionid];
        } else {
            this.connectionNodeMapDatabaseNode = {};
        }
    }

    /**
     * clear table data for database
     * @param databaseid 
     */
    public static clearTableCache(databaseid?: string) {
        if (databaseid) {
            delete this.databaseNodeMapTableNode[databaseid];
        } else {
            this.databaseNodeMapTableNode = {};
        }
    }

    /**
     * claer column data for table
     * @param tableid 
     */
    public static clearColumnCache(tableid?: string) {
        if (tableid) {
            delete this.tableNodeMapColumnNode[tableid];
        } else {
            this.tableNodeMapColumnNode = {};
        }
    }

    /**
     * get connectino tree data
     * @param connectcionid 
     */
    public static getDatabaseListOfConnection(connectcionid: string): DatabaseNode[] {
        if (this.connectionNodeMapDatabaseNode[connectcionid]) {
            return this.connectionNodeMapDatabaseNode[connectcionid];
        } else {
            return null;
        }
    }

    /**
     * get database tree data
     * @param databaseid 
     */
    private static tableTypeList = [ModelType.TABLE_GROUP, ModelType.VIEW_GROUP, ModelType.FUNCTION_GROUP, ModelType.TRIGGER_GROUP, ModelType.PROCEDURE_GROUP];
    public static getTableListOfDatabase(databaseid: string): Node[] {
        let result = [];
        this.tableTypeList.forEach((tableType) => {
            const tableList = this.databaseNodeMapTableNode[databaseid + "_" + tableType];
            if (tableList) { result = result.concat(tableList); }
        });
        if (result.length == 0) { return null; }
        return result;
    }

    public static getDatabase(connectId: string, dbName: string): DatabaseNode {
        const dbList = this.connectionNodeMapDatabaseNode[connectId];
        if (!dbList) { return null; }
        for (const dbNode of dbList) {
            if (dbNode.database == dbName) { return dbNode; }
        }
        return null;
    }

    public static getTable(databaseid: string, tableName: string): TableNode {
        const tableList = this.databaseNodeMapTableNode[databaseid + "_" + ModelType.TABLE_GROUP];
        if (!tableList) { return null; }
        for (const tableNode of tableList) {
            if (tableNode.table == tableName) { return tableNode; }
        }
        return null;
    }

    /**
     * get table tree data
     * @param tableid 
     */
    public static getColumnListOfTable(tableid: string): ColumnNode[] {
        if (this.tableNodeMapColumnNode[tableid]) {
            return this.tableNodeMapColumnNode[tableid];
        } else {
            return null;
        }
    }

    public static setDataBaseListOfConnection(connectionid: string, DatabaseNodeList: DatabaseNode[]) {
        this.connectionNodeMapDatabaseNode[connectionid] = DatabaseNodeList;
    }

    public static setTableListOfDatabase(databaseid: string, tableNodeList: Node[]) {
        this.databaseNodeMapTableNode[databaseid] = tableNodeList;
    }

    public static setColumnListOfTable(tableid: string, columnList: ColumnNode[]) {
        this.tableNodeMapColumnNode[tableid] = columnList;
    }


}