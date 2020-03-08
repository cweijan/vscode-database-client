import * as path from "path";
import * as vscode from "vscode";
import { TableNode } from "./tableNode";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ModelType, Constants } from "../../common/Constants";
import { ConnectionManager } from "../../database/ConnectionManager";
import { QueryUnit } from "../../database/QueryUnit";
import { MySQLTreeDataProvider } from "../../provider/MysqlTreeDataProvider";

export class ViewNode extends TableNode{
    type:string=ModelType.VIEW;

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

    public drop() {

        vscode.window.showInputBox({ prompt: `Are you want to drop view ${this.table} ?     `, placeHolder: 'Input y to confirm.' }).then(async inputContent => {
            if (inputContent.toLocaleLowerCase() == 'y') {
                QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP view ${this.database}.${this.table}`).then(() => {
                    DatabaseCache.clearTableCache(`${this.host}_${this.port}_${this.user}_${this.database}`)
                    MySQLTreeDataProvider.refresh()
                    vscode.window.showInformationMessage(`Drop view ${this.table} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel drop view ${this.table}!`)
            }
        })

    }

}