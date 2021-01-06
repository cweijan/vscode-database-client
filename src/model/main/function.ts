import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { ConnectionManager } from "../../service/connectionManager";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { Node } from "../interface/node";

export class FunctionNode extends Node {

    public contextValue: string = ModelType.FUNCTION;
    public iconPath = path.join(Constants.RES_PATH, "icon/function.svg")
    constructor(readonly name: string, readonly parent: Node) {
        super(name)
        this.id = `${parent.getConnectId()}_${parent.database}_${name}`
        this.init(parent)
        this.command = {
            command: "mysql.show.function",
            title: "Show Function Create Source",
            arguments: [this, true],
        }
    }

    public async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this, true), this.dialect.showFunctionSource(this.database,this.name))
            .then((procedDtails) => {
                const procedDtail = procedDtails[0];
                QueryUnit.showSQLTextDocument(`DROP FUNCTION IF EXISTS ${this.name}; \n\n${procedDtail['Create Function']}`);
            });
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }


    public drop() {

        Util.confirm(`Are you want to drop function ${this.name} ?`, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP function \`${this.database}\`.\`${this.name}\``).then(() => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.name}_${ModelType.FUNCTION_GROUP}`);
                DbTreeDataProvider.refresh(this.parent);
                vscode.window.showInformationMessage(`Drop function ${this.name} success!`);
            });
        })

    }

}
