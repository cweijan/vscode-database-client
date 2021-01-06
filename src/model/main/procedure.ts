import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { ConnectionManager } from "../../service/connectionManager";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { Node } from "../interface/node";


export class ProcedureNode extends Node {

    public contextValue: string = ModelType.PROCEDURE;
    public iconPath = path.join(Constants.RES_PATH, "icon/procedure.png")
    constructor(readonly name: string, readonly parent: Node) {
        super(name)
        this.init(parent)
        // this.id = `${info.getConnectKey()}_${info.database}_${name}`
        this.command = {
            command: "mysql.show.procedure",
            title: "Show Procedure Create Source",
            arguments: [this, true]
        }
    }

    public async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this, true), this.dialect.showProcedureSource(this.database,this.name))
            .then((procedDtails) => {
                const procedDtail = procedDtails[0]
                QueryUnit.showSQLTextDocument(`DROP PROCEDURE IF EXISTS ${this.name};\n${procedDtail['Create Procedure']}`);
            });
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }


    public drop() {

        Util.confirm(`Are you want to drop procedure ${this.name} ? `, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP procedure \`${this.database}\`.\`${this.name}\``).then(() => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.database}_${ModelType.PROCEDURE_GROUP}`)
                DbTreeDataProvider.refresh(this.parent)
                vscode.window.showInformationMessage(`Drop procedure ${this.name} success!`)
            })
        })

    }

}
