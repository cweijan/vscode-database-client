import * as path from "path";
import { QueryUnit } from "../../service/queryUnit";
import { InfoNode } from "../other/infoNode";
import { Node } from "../interface/node";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { TableNode } from "./tableNode";
import { Constants, ModelType, Template } from "../../common/constants";
import { ViewNode } from "./viewNode";
import { FileManager, FileModel } from "@/common/filesManager";

export class ViewGroup extends Node {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/view.png");
    public contextValue = ModelType.VIEW_GROUP
    constructor(readonly parent: Node) {
        super("VIEW")
        this.id = `${parent.getConnectId()}_${parent.database}_${ModelType.VIEW_GROUP}`;
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getChildListOfDatabase(this.id);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this),
            this.dialect.showViews(this.database))
            .then((tables) => {
                tableNodes = tables.map<TableNode>((table) => {
                    return new ViewNode(table.TABLE_NAME, '', this);
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

    public async createTemplate() {

        ConnectionManager.getConnection(this, true);
        const filePath = await FileManager.record(`${this.parent.id}#create-view-template.sql`, this.dialect.viewTemplate(), FileModel.WRITE)
        FileManager.show(filePath)

    }

}