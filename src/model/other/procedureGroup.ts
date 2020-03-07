import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../database/QueryUnit";
import { InfoNode } from "../InfoNode";
import { INode } from "../INode";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ConnectionManager } from "../../database/ConnectionManager";
import { TableNode } from "../table/tableNode";
import { IConnection } from "../Connection";
import { Constants, ModelType } from "../../common/Constants";
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
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT specific_name FROM mysql.proc WHERE db = '${this.database}' and type='PROCEDURE'`)
            .then((tables) => {
                tableNodes = tables.map<INode>((table) => {
                    return new ProcedureNode(this.host, this.user, this.password, this.port, this.database, table.specific_name, this.certPath)
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


}