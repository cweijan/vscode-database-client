import * as path from "path";
import * as vscode from "vscode";
import { Node } from "../interface/node";
import { ModelType, Constants } from "../../common/constants";
import { QueryUnit } from "../../database/QueryUnit";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ConnectionManager } from "../../database/ConnectionManager";
import { MySQLTreeDataProvider } from "../../provider/mysqlTreeDataProvider";
import { CopyAble } from "../interface/copyAble";
import { Util } from "../../common/util";
const wrap = Util.wrap;


export class ColumnNode extends Node implements CopyAble {
    public comment: string;
    public type: string;
    public contextValue: string = ModelType.COLUMN;
    public iconPath: string = path.join(Constants.RES_PATH, "table.svg");
    constructor(private readonly table: string, readonly column: any, readonly info: Node) {
        super(column.name)
        this.init(info)
        this.type = `${this.column.type}`
        this.comment = `${this.column.comment}`
        this.label = `${this.column.name} : ${this.column.type}  ${this.getIndex(this.column.key)}   ${this.column.comment}`
        this.collapsibleState = vscode.TreeItemCollapsibleState.None
        this.iconPath = path.join(Constants.RES_PATH, this.column.key === "PRI" ? "b_primary.png" : "b_props.png"),
            this.command = {
                command: "mysql.column.update",
                title: "Update Column Statement",
                arguments: [this, true],
            }
    }
    public copyName(): void {
        Util.copyToBoard(this.column.name)
    }

    private getIndex(columnKey: string) {
        switch (columnKey) {
            case 'UNI': return "UniqueKey";
            case 'MUL': return "IndexKey";
            case 'PRI': return "PrimaryKey";
        }
        return '';
    }


    public async getChildren(): Promise<Node[]> {
        return [];
    }

    public async changeColumnName() {

        const columnName = this.column.name;
        vscode.window.showInputBox({ value: columnName, placeHolder: 'newColumnName', prompt: `You will changed ${this.table}.${columnName} to new column name!` }).then(async (newColumnName) => {
            if (!newColumnName) { return; }
            const sql = `alter table ${wrap(this.database)}.${wrap(this.table)} change column ${wrap(columnName)} ${wrap(newColumnName)} ${this.column.type} comment '${this.column.comment}'`;
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), sql).then((rows) => {
                DatabaseCache.clearColumnCache(`${this.getConnectId()}_${this.database}_${this.table}`);
                MySQLTreeDataProvider.refresh();
            });

        });
    }

    public updateColumnTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.showSQLTextDocument(`ALTER TABLE 
    ${wrap(this.database)}.${wrap(this.table)} CHANGE ${wrap(this.column.name)} ${wrap(this.column.name)} ${this.column.type}${this.column.nullable ? "" : " NOT NULL"}${this.column.comment ? ` comment '${this.column.comment}'` : ""};`);
    }
    public dropColumnTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.showSQLTextDocument(`ALTER TABLE \n\t${wrap(this.database)}.${wrap(this.table)} DROP COLUMN ${wrap(this.column.name)};`);
    }


}
