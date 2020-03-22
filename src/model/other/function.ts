import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../database/QueryUnit";
import { INode } from "../INode";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ModelType, Constants } from "../../common/Constants";
import { IConnection } from "../Connection";
import { ConnectionManager } from "../../database/ConnectionManager";
import { MySQLTreeDataProvider } from "../../provider/MysqlTreeDataProvider";

export class FunctionNode implements INode, IConnection {

    identify: string;
    type: string = ModelType.FUNCTION;

    constructor(readonly host: string, readonly user: string, readonly password: string,
        readonly port: string, readonly database: string, readonly name: string,
        readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {

        this.identify = `${this.host}_${this.port}_${this.user}_${this.database}_${this.name}`
        return {
            label: this.name,
            // collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.FUNCTION,
            iconPath: path.join(Constants.RES_PATH, "function.svg"),
            command: {
                command: "mysql.show.function",
                title: "Show Function Create Source",
                arguments: [this, true]
            }
        };

    }

    async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this,true), `SHOW CREATE FUNCTION \`${this.database}\`.\`${this.name}\``)
        .then((procedDtail) => {
            procedDtail = procedDtail[0]
            QueryUnit.showSQLTextDocument(`DROP FUNCTION IF EXISTS ${procedDtail['Function']}; \n\n${procedDtail['Create Function']}`);
        });
    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {
        return [];
    }


    public drop() {

        vscode.window.showInputBox({ prompt: `Are you want to drop function ${this.name} ?     `, placeHolder: 'Input y to confirm.' }).then(async inputContent => {
            if(!inputContent)return;
            if (inputContent.toLocaleLowerCase() == 'y') {
                QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP function \`${this.database}\`.\`${this.name}\``).then(() => {
                    DatabaseCache.clearTableCache(`${this.host}_${this.port}_${this.user}_${this.database}_${ModelType.FUNCTION_GROUP}`)
                    MySQLTreeDataProvider.refresh()
                    vscode.window.showInformationMessage(`Drop function ${this.name} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel drop function ${this.name}!`)
            }
        })

    }

}
