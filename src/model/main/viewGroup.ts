import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../database/QueryUnit";
import { InfoNode } from "../other/infoNode";
import { Node } from "../interface/node";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ConnectionManager } from "../../database/ConnectionManager";
import { TableNode } from "./tableNode";
import { Constants, ModelType } from "../../common/constants";
import { ViewNode } from "./viewNode";

export class ViewGroup extends Node {

    public iconPath: string = path.join(Constants.RES_PATH, "view.svg");
    public contextValue = ModelType.VIEW_GROUP
    constructor(readonly info: Node) {
        super("VIEW")
        this.id = `${info.host}_${info.port}_${info.user}_${info.database}_${ModelType.VIEW_GROUP}`;
        this.init(info)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getTableListOfDatabase(this.id);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this),
            `SELECT TABLE_NAME FROM information_schema.VIEWS  WHERE TABLE_SCHEMA = '${this.database}' LIMIT ${QueryUnit.maxTableCount}`)
            .then((tables) => {
                tableNodes = tables.map<TableNode>((table) => {
                    return new ViewNode(table.TABLE_NAME, this.info);
                });
                DatabaseCache.setTableListOfDatabase(this.id, tableNodes);
                if (tableNodes.length == 0) {
                    return [new InfoNode("This database has no view")];
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
/* [DEFINER = { user | CURRENT_USER }]*/
VIEW \`name\`
AS
(SELECT * FROM ...);`);
    }

}