import { ViewMeta } from "@/common/typeDef";
import sqlFormatter from "@/service/format/sqlFormatter";
import * as vscode from "vscode";
import { ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { TableNode } from "./tableNode";

export class ViewNode extends TableNode {

    public contextValue: string = ModelType.VIEW;

    constructor(readonly meta: ViewMeta, readonly parent: Node) {
        super(meta,parent)
        if(meta?.type=='material'){
            this.description="material"
        }
    }

    public async showSource(open = true) {
        const sourceResule = await this.execute<any[]>(this.dialect.showViewSource(this.schema, this.table))
        const material=this.meta?.type=='material'?" MATERIALIZED ":"";
        const sql = `DROP${material} VIEW ${this.table};${sourceResule[0]['Create View']}`
        if(open){
            QueryUnit.showSQLTextDocument(this, sqlFormatter.format(sql));
        }
        return null;
    }

    public drop() {

        Util.confirm(`Are you want to drop view ${this.table} ? `, async () => {
            const material=this.meta?.type=='material'?" MATERIALIZED ":"";
            this.execute(`DROP${material} view ${this.wrap(this.table)}`).then(() => {
                this.parent.setChildCache(null)
                DbTreeDataProvider.refresh(this.parent);
                vscode.window.showInformationMessage(`Drop view ${this.table} success!`);
            });
        })

    }

}