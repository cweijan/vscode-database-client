import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../database/QueryUnit";
import { InfoNode } from "../InfoNode";
import { Node } from "../interface/node";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ConnectionManager } from "../../database/ConnectionManager";
import { ConnectionInfo } from "../interface/connection";
import { Constants, ModelType } from "../../common/Constants";
import { FunctionNode } from "./function";

export class FunctionGroup implements Node, ConnectionInfo {
    public type: string; public id: string;
    constructor(readonly host: string, readonly user: string,
        readonly password: string, readonly port: string, readonly database: string,
        readonly certPath: string) {
        this.id = `${this.host}_${this.port}_${this.user}_${this.database}_${ModelType.FUNCTION_GROUP}`;
    }


    public getTreeItem(): vscode.TreeItem {
        return {
            label: "FUNCTION",
            id: this.id,
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.FUNCTION_GROUP,
            iconPath: path.join(Constants.RES_PATH, "function.svg"),
        };
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getTableListOfDatabase(this.id);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT ROUTINE_NAME FROM information_schema.routines WHERE ROUTINE_SCHEMA = '${this.database}' and ROUTINE_TYPE='FUNCTION'`)
            .then((tables) => {
                tableNodes = tables.map<FunctionNode>((table) => {
                    return new FunctionNode(this.host, this.user, this.password, this.port, this.database, table.ROUTINE_NAME, this.certPath);
                });
                DatabaseCache.setTableListOfDatabase(this.id, tableNodes);
                if (tableNodes.length == 0) {
                    return [new InfoNode("This database has no function")];
                }
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public createTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.showSQLTextDocument(`CREATE
/*[DEFINER = { user | CURRENT_USER }]*/
FUNCTION \`name\`() RETURNS [TYPE
BEGIN
    return [value;
END;`);
    }

}