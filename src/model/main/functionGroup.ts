import * as path from "path";
import { Constants, ModelType, Template } from "../../common/constants";
import { ConnectionManager } from "../../database/ConnectionManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { InfoNode } from "../other/infoNode";
import { Node } from "../interface/node";
import { FunctionNode } from "./function";

export class FunctionGroup extends Node {

    public contextValue = ModelType.FUNCTION_GROUP;
    public iconPath = path.join(Constants.RES_PATH, "function.svg")
    constructor(readonly info: Node) {
        super("FUNCTION")
        this.id = `${info.getConnectId()}_${info.database}_${ModelType.FUNCTION_GROUP}`;
        this.init(info)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getTableListOfDatabase(this.id);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT ROUTINE_NAME FROM information_schema.routines WHERE ROUTINE_SCHEMA = '${this.database}' and ROUTINE_TYPE='FUNCTION'`)
            .then((tables) => {
                tableNodes = tables.map<FunctionNode>((table) => {
                    return new FunctionNode(table.ROUTINE_NAME, this.info);
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
FUNCTION [name]() RETURNS [TYPE]
BEGIN
    return [value];
END;`,Template.create);
    }

}