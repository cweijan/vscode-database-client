import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../database/QueryUnit";
import { INode } from "../INode";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ModelType, Constants } from "../../common/Constants";
import { IConnection } from "../Connection";
import { ConnectionManager } from "../../database/ConnectionManager";
import { MySQLTreeDataProvider } from "../../provider/MysqlTreeDataProvider";

export class TriggerNode implements INode, IConnection {
    identify: string;
    type: string = ModelType.TRIGGER;

    constructor(readonly host: string, readonly user: string, readonly password: string,
        readonly port: string, readonly database: string, readonly name: string,
        readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {

        this.identify = `${this.host}_${this.port}_${this.user}_${this.database}_${this.name}`
        return {
            label: this.name,
            // collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.TRIGGER,
            iconPath: path.join(Constants.RES_PATH, "trigger.svg"),
            command: {
                command: "mysql.show.trigger",
                title: "Show Trigger Create Source",
                arguments: [this, true]
            }
        };

    }

    async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this,true), `SHOW CREATE TRIGGER \`${this.database}\`.\`${this.name}\``)
        .then((procedDtail) => {
            procedDtail = procedDtail[0]
            QueryUnit.showSQLTextDocument(`\n\nDROP TRIGGER IF EXISTS ${procedDtail['Trigger']}; \n\n${procedDtail['SQL Original Statement']}`);
        });
    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {
        return [];
    }


    public drop() {

        vscode.window.showInputBox({ prompt: `Are you want to drop trigger ${this.name} ?     `, placeHolder: 'Input y to confirm.' }).then(async inputContent => {
            if(!inputContent)return;
            if (inputContent.toLocaleLowerCase() == 'y') {
                QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP trigger \`${this.database}\`.\`${this.name}\``).then(() => {
                    DatabaseCache.clearTableCache(`${this.host}_${this.port}_${this.user}_${this.database}_${ModelType.TRIGGER_GROUP}`)
                    MySQLTreeDataProvider.refresh()
                    vscode.window.showInformationMessage(`Drop trigger ${this.name} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel drop trigger ${this.name}!`)
            }
        })

    }

}
