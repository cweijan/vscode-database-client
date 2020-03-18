import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/Constants";
import { ConnectionManager } from "../../database/ConnectionManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { IConnection } from "../Connection";
import { InfoNode } from "../InfoNode";
import { INode } from "../INode";
import { ProcedureNode } from "./Procedure";

export class ProcedureGroup implements INode, IConnection {
    type: string; identify: string;
    constructor(readonly host: string, readonly user: string,
        readonly password: string, readonly port: string, readonly database: string,
        readonly certPath: string) {
        this.identify = `${this.host}_${this.port}_${this.user}_${this.database}_${ModelType.PROCEDURE_GROUP}`
    }


    public getTreeItem(): vscode.TreeItem {
        return {
            label: "PROCEDURE",
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.PROCEDURE_GROUP,
            iconPath: path.join(Constants.RES_PATH, "procedure.svg")
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {

        let tableNodes = DatabaseCache.getTableListOfDatabase(this.identify)
        if (tableNodes && !isRresh) {
            return tableNodes
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT ROUTINE_NAME FROM information_schema.routines WHERE ROUTINE_SCHEMA = '${this.database}' and ROUTINE_TYPE='PROCEDURE'`)
            .then((tables) => {
                tableNodes = tables.map<INode>((table) => {
                    return new ProcedureNode(this.host, this.user, this.password, this.port, this.database, table.ROUTINE_NAME, this.certPath)
                })
                DatabaseCache.setTableListOfDatabase(this.identify, tableNodes)
                if (tableNodes.length == 0) {
                    return [new InfoNode("This database has no procedure")];
                }
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    createTemplate() {
        ConnectionManager.getConnection(this, true)
        QueryUnit.createSQLTextDocument(`CREATE
/*[DEFINER = { user | CURRENT_USER }]*/
PROCEDURE [name]()
BEGIN

END;`)
    }

}