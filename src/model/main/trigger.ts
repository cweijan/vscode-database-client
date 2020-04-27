import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { DatabaseCache } from "../../service/databaseCache";
import { ModelType, Constants } from "../../common/constants";
import { ConnectionManager } from "../../service/connectionManager";
import { MySQLTreeDataProvider } from "../../provider/treeDataProvider";
import { Util } from "../../common/util";

export class TriggerNode extends Node  {


    public contextValue: string = ModelType.TRIGGER;
    public iconPath = path.join(Constants.RES_PATH, "trigger.svg")
    constructor(readonly name: string, readonly info: Node) {
        super(name)
        this.init(info)
        this.command = {
            command: "mysql.show.trigger",
            title: "Show Trigger Create Source",
            arguments: [this, true]
        }
    }

    public async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this, true), `SHOW CREATE TRIGGER \`${this.database}\`.\`${this.name}\``)
            .then((procedDtails) => {
                const procedDtail = procedDtails[0]
                QueryUnit.showSQLTextDocument(`\n\nDROP TRIGGER IF EXISTS ${procedDtail.Trigger}; \n\n${procedDtail['SQL Original Statement']}`);
            });
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }


    public drop() {

        Util.confirm(`Are you want to drop trigger ${this.name} ?`, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP trigger \`${this.database}\`.\`${this.name}\``).then(() => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.database}_${ModelType.TRIGGER_GROUP}`)
                MySQLTreeDataProvider.refresh()
                vscode.window.showInformationMessage(`Drop trigger ${this.name} success!`)
            })
        })

    }

}
