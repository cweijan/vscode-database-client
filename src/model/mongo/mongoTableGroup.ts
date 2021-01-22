import { Constants, ModelType } from "@/common/constants";
import { DiagnosticRelatedInformation } from "vscode";
import { Node } from "../interface/node";
import { TableGroup } from "../main/tableGroup";
import * as path from "path";
import { MonggoBaseNode } from "./mongoBaseNode";
import { TableNode } from "../main/tableNode";
import { MongoTableNode } from "./mongoTableNode";

export class MongoTableGroup extends MonggoBaseNode {

    contextValue = ModelType.TABLE_GROUP;
    public iconPath: string = path.join(Constants.RES_PATH, "icon/table.svg");
    constructor(readonly parent: Node) {
        super("COLLECTION")
        this.uid = `${parent.getConnectId()}_${parent.database}_${ModelType.TABLE_GROUP}`;
        this.init(parent)
    }


    public async getChildren() {


        const client = await this.getClient()

        const tables = await client.db(this.database).listCollections().toArray()

        const tableNodes = tables.map<TableNode>((table) => {
            return new MongoTableNode(table.name, null, this);
        });


        return tableNodes;
    }


}