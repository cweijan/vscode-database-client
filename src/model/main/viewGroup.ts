import * as path from "path";
import { Constants, DatabaseType, ModelType } from "../../common/constants";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { SystemViewGroup } from "./systemViewGroup";
import { TableNode } from "./tableNode";
import { ViewNode } from "./viewNode";

export class ViewGroup extends Node {

    public iconPath: { light: string; dark: string } = {
        dark: path.join(Constants.RES_PATH, "icon/table.svg"),
        light: path.join(Constants.RES_PATH, "light/view_group.png")
    };
    public contextValue = ModelType.VIEW_GROUP
    constructor(readonly parent: Node) {
        super("VIEW")
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getChildCache(this.uid);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return this.execute<any[]>(
            this.dialect.showViews(this.schema))
            .then((tables) => {
                tableNodes = tables.map<TableNode>((table) => {
                    return new ViewNode(table.name, '', this);
                });
                if (this.dbType == DatabaseType.MSSQL) {
                    tableNodes.unshift(new SystemViewGroup(this))
                } else if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This database has no view")];
                }
                DatabaseCache.setChildCache(this.uid, tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.viewTemplate(), 'create-view-template.sql')

    }

}
