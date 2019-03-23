import { DatabaseNode } from "../model/databaseNode";
import { TableNode } from "../model/tableNode";
import { ColumnNode } from "../model/columnNode";

export class DatabaseCache{

    static databaseNodes:DatabaseNode[]=[];
    private static databaseNodeMapTableNode={};
    private static tableNodeMapColumnNode={};

    static getTableNodeList(): TableNode[] {
        let tableNodeList=[];

        Object.keys(this.databaseNodeMapTableNode).forEach(key=>{
            let tempList=this.databaseNodeMapTableNode[key]
            if(tempList){
                tableNodeList=tableNodeList.concat(tempList)
            }
        })

        return tableNodeList;
    }

    static getTableListOfDatabase(databaseName:string):TableNode[]{
        if(this.databaseNodeMapTableNode[databaseName]){
            return this.databaseNodeMapTableNode[databaseName]
        }else{
            return []
        }
    }

    static getColumnListOfTable(tableName:string):ColumnNode[]{
        if(this.tableNodeMapColumnNode[tableName]){
            return this.tableNodeMapColumnNode[tableName]
        }else{
            return []
        }
        

    }

    static setTableListOfDatabase(databaseName:string,tableNodeList:TableNode[]){
        this.databaseNodeMapTableNode[databaseName]=tableNodeList
    }

    static setColumnListOfTable(tableName:string,columnList:ColumnNode[]){
        this.tableNodeMapColumnNode[tableName]=columnList
    }


}