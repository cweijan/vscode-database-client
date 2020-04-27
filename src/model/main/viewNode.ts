import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { ConnectionManager } from "../../service/connectionManager";
import { DatabaseCache } from "../../service/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { MySQLTreeDataProvider } from "../../provider/treeDataProvider";
import { TableNode } from "./tableNode";

export class ViewNode extends TableNode {

    public iconPath: string = path.join(Constants.RES_PATH, "view.svg");
    public contextValue: string = ModelType.VIEW;

    public drop() {

        Util.confirm(`Are you want to drop view ${this.table} ? `, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP view \`${this.database}\`.\`${this.table}\``).then(() => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.database}`);
                MySQLTreeDataProvider.refresh();
                vscode.window.showInformationMessage(`Drop view ${this.table} success!`);
            });
        })

    }

}