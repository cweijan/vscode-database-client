import sqlFormatter from "@/service/format/sqlFormatter";
import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { TableNode } from "./tableNode";

export class ViewNode extends TableNode {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/view.png");
    public contextValue: string = ModelType.VIEW;

    public async showSource() {
        this.execute<any[]>( this.dialect.showViewSource(this.database,this.table))
            .then((sourceResule) => {
                const sql   =`DROP VIEW ${this.table};${sourceResule[0]['Create View']}`
                QueryUnit.showSQLTextDocument(this,sqlFormatter.format(sql));
            });
    }

    public drop() {

        Util.confirm(`Are you want to drop view ${this.table} ? `, async () => {
            this.execute( `DROP view ${this.wrap(this.table)}`).then(() => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.database}`);
                DbTreeDataProvider.refresh(this.parent);
                vscode.window.showInformationMessage(`Drop view ${this.table} success!`);
            });
        })

    }

}