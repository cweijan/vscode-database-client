import { FileManager, FileModel } from "@/common/filesManager";
import * as path from "path";
import { Constants, DatabaseType, ModelType } from "../../common/constants";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { SystemViewGroup } from "./systemViewGroup";
import { TableNode } from "./tableNode";
import { ViewNode } from "./viewNode";

export class ViewGroup extends Node {

    public iconPath: { light: string ; dark: string } = {
        dark:  path.join(Constants.RES_PATH, "icon/table.svg"),
        light: path.join(Constants.RES_PATH, "light/view_group.png")
    };
    public contextValue = ModelType.VIEW_GROUP
    constructor(readonly parent: Node) {
        super("VIEW")
        this.uid = `${parent.getConnectId()}_${parent.database}_${ModelType.VIEW_GROUP}`;
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getChildListOfId(this.uid);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this),
            this.dialect.showViews(this.database))
            .then((tables) => {
                tableNodes = tables.map<TableNode>((table) => {
                    return new ViewNode(table.name, '', this);
                });
                if (this.dbType == DatabaseType.MSSQL || this.dbType == DatabaseType.PG) {
                    tableNodes.unshift(new SystemViewGroup(this))
                } else if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This database has no view")];
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
        const filePath = await FileManager.record(`${this.parent.uid}#create-view-template.sql`, this.dialect.viewTemplate(), FileModel.WRITE)
        FileManager.show(filePath)

    }

}
