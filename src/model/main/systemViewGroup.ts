import * as path from "path";
import { Constants, ModelType } from "../../common/constants";
import { DatabaseCache } from "../../service/common/databaseCache";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { TableNode } from "./tableNode";
import { ViewNode } from "./viewNode";

export class SystemViewGroup extends Node {

    public iconPath: { light: string; dark: string } = {
        dark: path.join(Constants.RES_PATH, "icon/table.svg"),
        light: path.join(Constants.RES_PATH, "light/view_group.png")
    };
    public contextValue = ModelType.SYSTEM_VIEW_GROUP
    constructor(readonly parent: Node) {
        super("SYSTEM_VIEW")
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getChildListOfId(this.uid);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return this.execute<any[]>(
            this.dialect.showSystemViews(this.database))
            .then((tables) => {
                tableNodes = tables.map<TableNode>((table) => {
                    return new ViewNode(table.name, '', this);
                });
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This database has no system view")];
                }
                DatabaseCache.setChildListOfDatabase(this.uid, tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

}
