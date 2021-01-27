import { ExtensionContext, TreeItemCollapsibleState } from "vscode";
import { CacheKey, ModelType } from "../../common/constants";
import { DatabaseNode } from "../../model/database/databaseNode";
import { Node } from "../../model/interface/node";

export class DatabaseCache {

    private static context: ExtensionContext;
    private static cache = { database: {} };
    private static childCache = {};
    private static collpaseState: { key?: TreeItemCollapsibleState };

    /**
     * get element current collapseState or default collapseState
     * @param element 
     */
    public static getElementState(element?: Node) {

        const contextValue = element.contextValue;
        if (!contextValue || contextValue == ModelType.COLUMN || contextValue == ModelType.INFO || contextValue == ModelType.FUNCTION
            || contextValue == ModelType.TRIGGER || contextValue == ModelType.PROCEDURE || contextValue == ModelType.USER
            || contextValue == ModelType.DIAGRAM || contextValue == ModelType.ES_COLUMN
        ) {
            return TreeItemCollapsibleState.None;
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

    public static clearCache() {
        this.childCache = {}
        this.cache.database = {}
    }


    /**
     * clear table data for database
     * @param dbChildid 
     */
    public static clearChildCache(dbChildid: string) {
        if (dbChildid) {
            delete this.childCache[dbChildid];
        }
    }

    public static setChildCache(uid: string, tableNodeList: Node[]) {
        this.childCache[uid] = tableNodeList;
    }

    public static getChildCache(uid: string): Node[] {
        return this.childCache[uid];
    }

    /**
     * clear database data for connection
     * @param connectionid 
     */
    public static clearDatabaseCache(connectionid: string) {
        if (connectionid) {
            delete this.cache.database[connectionid];
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



}
