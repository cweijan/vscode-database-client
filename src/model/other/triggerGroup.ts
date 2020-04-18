import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../database/QueryUnit";
import { InfoNode } from "../InfoNode";
import { Node } from "../interface/node";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ConnectionManager } from "../../database/ConnectionManager";
import { ConnectionInfo } from "../interface/connection";
import { Constants, ModelType } from "../../common/Constants";
import { TriggerNode } from "./Trigger";

export class TriggerGroup implements Node, ConnectionInfo {
    public type: string; public identify: string;
    constructor(readonly host: string, readonly user: string,
        readonly password: string, readonly port: string, readonly database: string,
        readonly certPath: string) {
        this.identify = `${this.host}_${this.port}_${this.user}_${this.database}_${ModelType.TRIGGER_GROUP}`;
    }


    public getTreeItem(): vscode.TreeItem {
        return {
            label: "TRIGGER",
            id: this.identify,
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.TRIGGER_GROUP,
            iconPath: path.join(Constants.RES_PATH, "trigger.svg"),
        };
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getTableListOfDatabase(this.identify);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = '${this.database}'`)
            .then((tables) => {
                tableNodes = tables.map<TriggerNode>((table) => {
                    return new TriggerNode(this.host, this.user, this.password, this.port, this.database, table.TRIGGER_NAME, this.certPath);
                });
                DatabaseCache.setTableListOfDatabase(this.identify, tableNodes);
                if (tableNodes.length == 0) {
                    return [new InfoNode("This database has no trigger")];
                }
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }


    public createTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.createSQLTextDocument(`CREATE
/*[DEFINER = { user | CURRENT_USER }]*/
TRIGGER \`name\` BEFORE/AFTER INSERT/UPDATE/DELETE
ON \`table\`
FOR EACH ROW BEGIN

END;`);
    }

}