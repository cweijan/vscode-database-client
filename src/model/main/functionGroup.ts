import * as path from "path";
import { Constants, ModelType, Template } from "../../common/constants";
import { ConnectionManager } from "../../service/connectionManager";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { InfoNode } from "../other/infoNode";
import { Node } from "../interface/node";
import { FunctionNode } from "./function";
import { FileManager, FileModel } from "@/common/filesManager";

export class FunctionGroup extends Node {

    public contextValue = ModelType.FUNCTION_GROUP;
    public iconPath = path.join(Constants.RES_PATH, "icon/function.svg")
    constructor(readonly parent: Node) {
        super("FUNCTION")
        this.id = `${parent.getConnectId()}_${parent.database}_${ModelType.FUNCTION_GROUP}`;
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getChildListOfId(this.id);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), this.dialect.showFunctions(this.database))
            .then((tables) => {
                tableNodes = tables.map<FunctionNode>((table) => {
                    return new FunctionNode(table.ROUTINE_NAME, this);
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

    public async createTemplate() {

        ConnectionManager.getConnection(this, true);
        const filePath = await FileManager.record(`${this.parent.id}#create-function-template.sql`, this.dialect.functionTemplate(), FileModel.WRITE)
        FileManager.show(filePath)

    }

}