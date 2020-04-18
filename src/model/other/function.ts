import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../database/QueryUnit";
import { Node } from "../interface/node";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ModelType, Constants } from "../../common/Constants";
import { ConnectionInfo } from "../interface/connection";
import { ConnectionManager } from "../../database/ConnectionManager";
import { MySQLTreeDataProvider } from "../../provider/MysqlTreeDataProvider";

export class FunctionNode implements Node, ConnectionInfo {

    public identify: string;
    public type: string = ModelType.FUNCTION;

    constructor(readonly host: string, readonly user: string, readonly password: string,
        readonly port: string, readonly database: string, readonly name: string,
        readonly certPath: string) {
        this.identify = `${this.host}_${this.port}_${this.user}_${this.database}_${this.name}`;
    }

    public getTreeItem(): vscode.TreeItem {

        return {
            label: this.name,
            id: this.identify,
            contextValue: ModelType.FUNCTION,
            iconPath: path.join(Constants.RES_PATH, "function.svg"),
            command: {
                command: "mysql.show.function",
                title: "Show Function Create Source",
                arguments: [this, true],
            },
        };

    }

    public async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this, true), `SHOW CREATE FUNCTION \`${this.database}\`.\`${this.name}\``)
            .then((procedDtail) => {
                procedDtail = procedDtail[0];
                QueryUnit.showSQLTextDocument(`DROP FUNCTION IF EXISTS ${procedDtail['Function']}; \n\n${procedDtail['Create Function']}`);
            });
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }


    public drop() {

        vscode.window.showInputBox({ prompt: `Are you want to drop function ${this.name} ?     `, placeHolder: 'Input y to confirm.' }).then(async (inputContent) => {
            if (!inputContent) { return; }
            if (inputContent.toLocaleLowerCase() == 'y') {
                QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP function \`${this.database}\`.\`${this.name}\``).then(() => {
                    DatabaseCache.clearTableCache(`${this.host}_${this.port}_${this.user}_${this.database}_${ModelType.FUNCTION_GROUP}`);
                    MySQLTreeDataProvider.refresh();
                    vscode.window.showInformationMessage(`Drop function ${this.name} success!`);
                });
            } else {
                vscode.window.showInformationMessage(`Cancel drop function ${this.name}!`);
            }
        });

    }

}
