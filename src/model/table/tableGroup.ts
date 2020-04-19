import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../database/QueryUnit";
import { InfoNode } from "../InfoNode";
import { Node } from "../interface/node";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ConnectionManager } from "../../database/ConnectionManager";
import { TableNode } from "./tableNode";
import { ConnectionInfo } from "../interface/connection";
import { Constants, ModelType } from "../../common/Constants";

export class TableGroup implements Node, ConnectionInfo {
    public type: string; public identify: string;
    constructor(readonly host: string, readonly user: string, readonly password: string,
        readonly port: string, readonly database: string, readonly certPath: string) {

        this.identify = `${this.host}_${this.port}_${this.user}_${this.database}_${ModelType.TABLE_GROUP}`;
    }


    public getTreeItem(): vscode.TreeItem {
        return {
            label: "TABLE",
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.TABLE_GROUP,
            iconPath: path.join(Constants.RES_PATH, "table.svg"),
        };
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getTableListOfDatabase(this.identify);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this),
            `SELECT TABLE_NAME FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${this.database}' and TABLE_TYPE<>'VIEW' order by table_name LIMIT ${QueryUnit.maxTableCount} ;`)
            .then((tables) => {
                tableNodes = tables.map<TableNode>((table) => {
                    return new TableNode(this.host, this.user, this.password, this.port, this.database, table.TABLE_NAME, this.certPath);
                });
                DatabaseCache.setTableListOfDatabase(this.identify, tableNodes);
                if (tableNodes.length == 0) {
                    return [new InfoNode("This database has no table")];
                }
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public createTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.createSQLTextDocument(`CREATE TABLE tableName(  
  id int NOT NULL primary key AUTO_INCREMENT,
  column varchar(length)
);`);
    }
}