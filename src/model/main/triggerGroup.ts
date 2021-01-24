import * as path from "path";
import { Constants, ModelType } from "../../common/constants";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { TriggerNode } from "./trigger";

export class TriggerGroup extends Node {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/trigger.svg");
    public contextValue = ModelType.TRIGGER_GROUP

    constructor(readonly parent: Node) {
        super("TRIGGER")
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getChildListOfId(this.uid);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return this.execute<any[]>(this.dialect.showTriggers(this.database))
            .then((tables) => {
                tableNodes = tables.map<TriggerNode>((table) => {
                    return new TriggerNode(table.TRIGGER_NAME, this);
                });
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This database has no trigger")];
                }
                DatabaseCache.setChildListOfDatabase(this.uid, tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }


    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.triggerTemplate(), 'create-trigger-template.sql')

    }

}
