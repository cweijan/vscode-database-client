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
        this.uid = `${parent.getConnectId()}_${parent.database}_${ModelType.FUNCTION_GROUP}`;
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getChildListOfId(this.uid);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), this.dialect.showFunctions(this.database))
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

        ConnectionManager.getConnection(this, true);
        const filePath = await FileManager.record(`${this.parent.uid}#create-function-template.sql`, this.dialect.functionTemplate(), FileModel.WRITE)
        FileManager.show(filePath)

    }

}
