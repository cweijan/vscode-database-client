import { Global } from "@/common/global";
import { ExtensionContext, TreeItemCollapsibleState } from "vscode";
import { CacheKey, ConfigKey, ModelType } from "../../common/constants";
import { DatabaseNode } from "../../model/database/databaseNode";
import { Node } from "../../model/interface/node";
import { ColumnNode } from "../../model/other/columnNode";

export class DatabaseCache {

    private static context: ExtensionContext;
    private static cache = { database: {}, table: {}, column: {} };
    private static collpaseState: { key?: TreeItemCollapsibleState };

    public static evictAllCache(): any {
        if (this.context == null) { throw new Error("DatabaseCache is not init!"); }
        this.cache.database = {};
        this.cache.table = {};
        this.cache.column = {};
    }

    /**
     * get element current collapseState or default collapseState
     * @param element 
     */
    public static getElementState(element?: Node) {

        const contextValue = element.contextValue;
        if (!contextValue || contextValue == ModelType.COLUMN || contextValue == ModelType.INFO || contextValue == ModelType.FUNCTION
            || contextValue == ModelType.TRIGGER || contextValue == ModelType.PROCEDURE || contextValue == ModelType.USER
            || contextValue==ModelType.DIAGRAM || contextValue==ModelType.ES_COLUMN
        ) {
            return TreeItemCollapsibleState.None;
        }

        if (!Global.getConfig<boolean>(ConfigKey.LOAD_META_ON_CONNECT)) {
            return TreeItemCollapsibleState.Collapsed;
        }

        if (!this.collpaseState || Object.keys(this.collpaseState).length == 0) {
            this.collpaseState =
                (element.global === false) ?
                    this.context.workspaceState.get(CacheKey.CollapseSate) : this.context.globalState.get(CacheKey.CollapseSate)
                ;
        }

        if (!this.collpaseState) {
            this.collpaseState = {};
        }

        if (element.uid && this.collpaseState[element.uid]) {
            return this.collpaseState[element.uid];
        } else if (contextValue == ModelType.CONNECTION || contextValue == ModelType.TABLE_GROUP) {
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

        this.collpaseState[element.uid] = collapseState;
        if (element.global === false) {
            this.context.workspaceState.update(CacheKey.CollapseSate, this.collpaseState);
        } else {
            this.context.globalState.update(CacheKey.CollapseSate, this.collpaseState);
        }

    }

    /**
     * cache init, Mainly initializing context object
     * @param context 
     */
    public static initCache(context: ExtensionContext) {
        this.context = context;
    }


    /**
     * clear table data for database
     * @param dbChildid 
     */
    public static clearTableCache(dbChildid?: string) {
        if (dbChildid) {
            delete this.cache.table[dbChildid];
        } else {
            this.cache.table = {};
        }
    }

    public static setChildListOfDatabase(uid: string, tableNodeList: Node[]) {
        this.cache.table[uid] = tableNodeList;
    }

    public static getChildListOfId(uid: string): Node[] {
        return this.cache.table[uid];
    }

    /**
     * clear database data for connection
     * @param connectionid 
     */
    public static clearDatabaseCache(connectionid?: string) {
        if (connectionid) {
            delete this.cache.database[connectionid];
        } else {
            this.cache.database = {};
        }
    }

    /**
     * support to complection manager
     */
    public static getDatabaseNodeList(): DatabaseNode[] {
        let databaseNodeList = [];

        Object.keys(this.cache.database).forEach((key) => {
            const tempList = this.cache.database[key];
            if (tempList) {
                databaseNodeList = databaseNodeList.concat(tempList);
            }
        });

        return databaseNodeList;
    }

    public static setDataBaseListOfConnection(connectionid: string, DatabaseNodeList: DatabaseNode[]) {
        this.cache.database[connectionid] = DatabaseNodeList;
    }

    public static getDatabaseListOfConnection(connectcionid: string): DatabaseNode[] {
        if (this.cache.database[connectcionid]) {
            return this.cache.database[connectcionid];
        } else {
            return null;
        }
    }

    /**
      * claer column data for table
      * @param tableid 
      */
    public static clearColumnCache(tableid?: string) {
        if (tableid) {
            delete this.cache.column[tableid];
        } else {
            this.cache.column = {};
        }
    }

    public static setColumnListOfTable(tableid: string, columnList: ColumnNode[]) {
        this.cache.column[tableid] = columnList;
    }
    public static getColumnListOfTable(tableid: string): ColumnNode[] {
        return this.cache.column[tableid];
    }

}
