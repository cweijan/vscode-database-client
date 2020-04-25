import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { ConnectionManager } from "../../database/ConnectionManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { MySQLTreeDataProvider } from "../../provider/mysqlTreeDataProvider";
import { Node } from "../interface/node";

export class FunctionNode extends Node {

    public contextValue: string = ModelType.FUNCTION;
    public iconPath = path.join(Constants.RES_PATH, "function.svg")
    constructor(readonly name: string, readonly info: Node) {
        super(name)
        this.id = `${info.getConnectId()}_${info.database}_${name}`
        this.init(info)
        this.command = {
            command: "mysql.show.function",
            title: "Show Function Create Source",
            arguments: [this, true],
        }
    }

    public async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this, true), `SHOW CREATE FUNCTION \`${this.database}\`.\`${this.name}\``)
            .then((procedDtails) => {
                const procedDtail = procedDtails[0];
                QueryUnit.showSQLTextDocument(`DROP FUNCTION IF EXISTS ${procedDtail.Function}; \n\n${procedDtail['Create Function']}`);
            });
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }


    public drop() {

        Util.confirm(`Are you want to drop function ${this.name} ?`, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP function \`${this.database}\`.\`${this.name}\``).then(() => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.name}_${ModelType.FUNCTION_GROUP}`);
                MySQLTreeDataProvider.refresh();
                vscode.window.showInformationMessage(`Drop function ${this.name} success!`);
            });
        })

    }

}
