import * as path from "path";
import { QueryUnit } from "../../service/queryUnit";
import { InfoNode } from "../other/infoNode";
import { Node } from "../interface/node";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { TableNode } from "./tableNode";
import { Constants, ModelType, Template } from "../../common/constants";
import { FileManager, FileModel } from "@/common/filesManager";

export class TableGroup extends Node {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/table.svg");
    public contextValue: string = ModelType.TABLE_GROUP;
    constructor(readonly info: Node) {
        super("TABLE")
        this.uid = `${info.getConnectId()}_${info.database}_${ModelType.TABLE_GROUP}`;
        this.init(info)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getChildListOfId(this.uid);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), this.dialect.showTables(this.database))
            .then((tables) => {
                tableNodes = tables.map<TableNode>((table) => {
                    return new TableNode(table.name, table.comment, this);
                });
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This database has no table")];
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
        const filePath = await FileManager.record(`${this.info.uid}#create-table-template.sql`, this.dialect.tableTemplate(), FileModel.WRITE)
        FileManager.show(filePath)

    }
}
