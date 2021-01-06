import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ModelType, Constants } from "../../common/constants";
import { ConnectionManager } from "../../service/connectionManager";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { Util } from "../../common/util";

export class TriggerNode extends Node  {


    public contextValue: string = ModelType.TRIGGER;
    public iconPath = path.join(Constants.RES_PATH, "icon/trigger.svg")
    constructor(readonly name: string, readonly parent: Node) {
        super(name)
        this.init(parent)
        this.command = {
            command: "mysql.show.trigger",
            title: "Show Trigger Create Source",
            arguments: [this, true]
        }
    }

    public async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this, true), this.dialect.showTriggerSource(this.database,this.name))
            .then((procedDtails) => {
                const procedDtail = procedDtails[0]
                QueryUnit.showSQLTextDocument(`\n\nDROP TRIGGER IF EXISTS ${this.name}; \n\n${procedDtail['SQL Original Statement']}`);
            });
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }


    public drop() {

        Util.confirm(`Are you want to drop trigger ${this.name} ?`, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP trigger \`${this.database}\`.\`${this.name}\``).then(() => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.database}_${ModelType.TRIGGER_GROUP}`)
                DbTreeDataProvider.refresh(this.parent)
                vscode.window.showInformationMessage(`Drop trigger ${this.name} success!`)
            })
        })

    }

}
