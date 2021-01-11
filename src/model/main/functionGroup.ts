import * as path from "path";
import { Constants, ModelType } from "../../common/constants";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { FunctionNode } from "./function";

export class FunctionGroup extends Node {

    public contextValue = ModelType.FUNCTION_GROUP;
    public iconPath = path.join(Constants.RES_PATH, "icon/function.svg")
    constructor(readonly parent: Node) {
        super("FUNCTION")
        this.uid = `${parent.getConnectId()}_${parent.database}_${ModelType.FUNCTION_GROUP}`;
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getChildListOfId(this.uid);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return this.execute<any[]>( this.dialect.showFunctions(this.database))
            .then((tables) => {
                tableNodes = tables.map<FunctionNode>((table) => {
                    return new FunctionNode(table.ROUTINE_NAME, this);
                });
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This database has no function")];
                }
                DatabaseCache.setTableListOfDatabase(this.uid, tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.functionTemplate(), 'create-function-template.sql')

    }

}
