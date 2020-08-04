import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { ConnectionManager } from "../../service/connectionManager";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { Node } from "../interface/node";

export class DiagramNode extends Node {

    public contextValue: string = ModelType.DIAGRAM;
    public iconPath = path.join(Constants.RES_PATH, "icon/function.svg")
    constructor(readonly name: string, readonly info: Node) {
        super(name)
        this.id = `${info.getConnectId()}_${info.database}_${name}`
        this.init(info)
        this.command = {
            command: "mysql.show.function",
            title: "Show Function Create Source",
            arguments: [this, true],
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }

    public drop() {

        Util.confirm(`Are you want to drop function ${this.name} ?`, async () => {
         
        })

    }

}
