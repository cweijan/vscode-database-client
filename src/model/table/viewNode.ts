import * as path from "path";
import * as vscode from "vscode";
import { TableNode } from "./tableNode";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ModelType, Constants } from "../../common/Constants";

export class ViewNode extends TableNode{
    public getTreeItem(): vscode.TreeItem {

        this.identify = `${this.host}_${this.port}_${this.user}_${this.database}_${this.table}`
        return {
            label: this.table,
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.VIEW,
            iconPath: path.join(Constants.RES_PATH, "view.svg"),
            command: {
                command: "mysql.template.sql",
                title: "Run Select Statement",
                arguments: [this, true]
            }
        };

    }
}