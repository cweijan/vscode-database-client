import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { ConnectionManager } from "../../service/connectionManager";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { TableNode } from "./tableNode";
import sqlFormatter from "@/service/format/sqlFormatter";

export class ViewNode extends TableNode {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/view.png");
    public contextValue: string = ModelType.VIEW;

    public async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this, true), this.dialect.showViewSource(this.database,this.table))
            .then((sourceResule) => {
                const sql   =`DROP VIEW ${this.table};${sourceResule[0]['Create View']}`
                QueryUnit.showSQLTextDocument(sqlFormatter.format(sql));
            });
    }

    public drop() {

        Util.confirm(`Are you want to drop view ${this.table} ? `, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP view ${this.wrap(this.table)}`).then(() => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.database}`);
                DbTreeDataProvider.refresh(this.parent);
                vscode.window.showInformationMessage(`Drop view ${this.table} success!`);
            });
        })

    }

}