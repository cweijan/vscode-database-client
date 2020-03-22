import { ExtensionContext, TreeItemCollapsibleState } from "vscode";
import { CacheKey, ModelType } from "../common/Constants";
import { ColumnNode } from "../model/table/columnNode";
import { DatabaseNode } from "../model/database/databaseNode";
import { INode } from "../model/INode";
import { TableNode } from "../model/table/tableNode";

export class DatabaseCache {

    private static context: ExtensionContext;
    private static connectionNodeMapDatabaseNode = {};
    private static databaseNodeMapTableNode = {};
    private static tableNodeMapColumnNode = {};
    private static collpaseState: { key?: TreeItemCollapsibleState };

    static evictAllCache(): any {
        if (this.context == null) throw new Error("DatabaseCache is not init!")
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
            if (tempList && (tempList[0] instanceof TableNode)) {
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
        } else if (element.type == ModelType.CONNECTION || element.type == ModelType.TABLE_GROUP) {
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

        if (element.type == ModelType.COLUMN || element.type == ModelType.INFO) {
            return;
        }

        this.collpaseState[element.identify] = collapseState
        this.context.globalState.update(CacheKey.CollapseSate, this.collpaseState)

    }

    /**
     * cache init, Mainly initializing context object
     * @param context 
     */
    static initCache(context: ExtensionContext) {
        this.context = context;
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
     * @param databaseIdentify 
     */
    private static tableTypeList = [ModelType.TABLE_GROUP, ModelType.VIEW_GROUP, ModelType.FUNCTION_GROUP, ModelType.TRIGGER_GROUP, ModelType.PROCEDURE_GROUP];
    static getTableListOfDatabase(databaseIdentify: string): INode[] {
        let result = [];
        this.tableTypeList.forEach(tableType => {
            let tableList = this.databaseNodeMapTableNode[databaseIdentify +"_"+ tableType]
            if (tableList) result=result.concat(tableList)
        });
        if (result.length == 0) return null;
        return result;
    }

    static getTable(databaseIdentify:string,tableName:String):TableNode{
        let tableList = this.databaseNodeMapTableNode[databaseIdentify +"_"+ ModelType.TABLE_GROUP]
        if(!tableList)return null;
        for (const tableNode of tableList) {
            if(tableNode.table==tableName)return tableNode;
        }
        return null;
    }

    /**
     * get table tree data
     * @param tableIdentify 
     */
    static getColumnListOfTable(tableIdentify: string): ColumnNode[] {
        if (this.tableNodeMapColumnNode[tableIdentify]) {
            return this.tableNodeMapColumnNode[tableIdentify]
        } else {
            return null
        }
    }

    static setDataBaseListOfConnection(connectionIdentify: string, DatabaseNodeList: DatabaseNode[]) {
        this.connectionNodeMapDatabaseNode[connectionIdentify] = DatabaseNodeList
    }

    static setTableListOfDatabase(databaseIdentify: string, tableNodeList: INode[]) {
        this.databaseNodeMapTableNode[databaseIdentify] = tableNodeList
    }

    static setColumnListOfTable(tableIdentify: string, columnList: ColumnNode[]) {
        this.tableNodeMapColumnNode[tableIdentify] = columnList
    }


}