import * as path from "path";
import * as vscode from "vscode";
import { INode } from "../INode";
import { ModelType, Constants } from "../../common/Constants";
import { QueryUnit } from "../../database/QueryUnit";
import { DatabaseCache } from "../../database/DatabaseCache";
import { IConnection } from "../Connection";
import { ConnectionManager } from "../../database/ConnectionManager";
import { MySQLTreeDataProvider } from "../../provider/MysqlTreeDataProvider";

class ColumnTreeItem extends vscode.TreeItem {
    columnName: string;
    detail: string;
    document: string;
}

export class ColumnNode implements INode, IConnection {

    identify: string;
    type: string = ModelType.COLUMN;
    constructor(readonly host: string, readonly user: string, readonly password: string,
        readonly port: string, readonly database: string, private readonly table: string,
        readonly certPath: string, private readonly column: any) {
    }

    public getTreeItem(): ColumnTreeItem {
        return {
            columnName: `${this.column.COLUMN_NAME}`,
            detail: `${this.column.COLUMN_TYPE}`,
            document: `${this.column.COLUMN_COMMENT}`,
            label: `${this.column.COLUMN_NAME} : ${this.column.COLUMN_TYPE}     ${this.column.COLUMN_COMMENT}`,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            contextValue: ModelType.COLUMN,
            iconPath: path.join(Constants.RES_PATH,  this.column.COLUMN_KEY === "PRI" ? "b_primary.png" : "b_props.png"),
        };
    }

    public async getChildren(): Promise<INode[]> {
        return [];
    }

    public async changeColumnName( mysqlTreeDataProvider: MySQLTreeDataProvider) {
        
        const columnName = this.column.COLUMN_NAME
        vscode.window.showInputBox({ value: columnName, placeHolder: 'newColumnName', prompt: `You will changed ${this.table}.${columnName} to new column name!` }).then(async newColumnName => {
            if (!newColumnName) return
            const sql = `alter table ${this.database}.${this.table} change column ${columnName} ${newColumnName} ${this.column.COLUMN_TYPE}`
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), sql).then((rows) => {
                DatabaseCache.clearColumnCache(`${this.host}_${this.port}_${this.user}_${this.database}_${this.table}`)
                mysqlTreeDataProvider.refresh()
            })

        })
    }

}
