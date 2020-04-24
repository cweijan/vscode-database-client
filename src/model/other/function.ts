import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../database/QueryUnit";
import { Node } from "../interface/node";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ModelType, Constants } from "../../common/Constants";
import { ConnectionInfo } from "../interface/connection";
import { ConnectionManager } from "../../database/ConnectionManager";
import { MySQLTreeDataProvider } from "../../provider/MysqlTreeDataProvider";
import { Util } from "../../common/util";

export class FunctionNode extends Node {

    public contextValue: string = ModelType.FUNCTION;
    public iconPath = path.join(Constants.RES_PATH, "function.svg")
    constructor(readonly name: string, readonly info: ConnectionInfo) {
        super(name)
        this.id = `${info.host}_${info.port}_${info.user}_${info.database}_${name}`
        this.init(info)
        this.command = {
            command: "mysql.show.function",
            title: "Show Function Create Source",
            arguments: [this, true],
        }
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

        Util.confirm(`Are you want to drop function ${this.name} ?`, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP function \`${this.database}\`.\`${this.name}\``).then(() => {
                DatabaseCache.clearTableCache(`${this.host}_${this.port}_${this.user}_${this.name}_${ModelType.FUNCTION_GROUP}`);
                MySQLTreeDataProvider.refresh();
                vscode.window.showInformationMessage(`Drop function ${this.name} success!`);
            });
        })

    }

}
