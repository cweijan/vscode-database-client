import * as path from "path";
import * as vscode from "vscode";
import { Node } from "../interface/node";
import { ModelType, Constants, Template } from "../../common/constants";
import { QueryUnit } from "../../service/queryUnit";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { CopyAble } from "../interface/copyAble";
import { Util } from "../../common/util";
import { ColumnMeta } from "./columnMeta";

export class ColumnNode extends Node implements CopyAble {
    public type: string;
    public contextValue: string = ModelType.COLUMN;
    public isPrimaryKey = false;
    constructor(private readonly table: string, readonly column: ColumnMeta, readonly parent: Node, readonly index: number) {
        super(column.name)
        this.init(parent)
        this.type = `${this.column.type}`
        this.description = `${this.column.comment}`
        this.label = `${this.column.name} : ${this.column.type}  ${this.getIndex(this.column.key)}`
        this.collapsibleState = vscode.TreeItemCollapsibleState.None
        this.iconPath = path.join(Constants.RES_PATH, this.column.key === "PRI" ? "icon/b_primary.png" : "icon/b_props.png");
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
            case 'PRI':
                this.isPrimaryKey = true
                return "PrimaryKey";
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
            const sql = `alter table ${this.wrap(this.database)}.${this.wrap(this.table)} change column ${this.wrap(columnName)} ${this.wrap(newColumnName)} ${this.column.type} comment '${this.column.comment}'`;
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), sql).then((rows) => {
                DatabaseCache.clearColumnCache(`${this.getConnectId()}_${this.database}_${this.table}`);
                DbTreeDataProvider.refresh(this.parent);
            });

        });
    }

    public updateColumnTemplate() {

        ConnectionManager.getConnection(this, true);

        const comment = this.column.comment ? ` comment '${this.column.comment}'` : "";
        const defaultDefinition = this.column.nullable == "YES" ? "" : " NOT NULL";

        QueryUnit.showSQLTextDocument(`ALTER TABLE 
    ${this.wrap(this.database)}.${this.wrap(this.table)} CHANGE ${this.wrap(this.column.name)} ${this.wrap(this.column.name)} ${this.column.type}${defaultDefinition}${comment};`, Template.alter);

    }
    public async dropColumnTemplate() {

        ConnectionManager.getConnection(this, true);
        await QueryUnit.showSQLTextDocument(`ALTER TABLE \n\t${this.wrap(this.database)}.${this.wrap(this.table)} DROP COLUMN ${this.wrap(this.column.name)};`, Template.alter);
        Util.confirm(`Are you want to drop column ${this.column.name} ? `, async () => {
            QueryUnit.runQuery(null,this)
        })

    }


    public async moveDown() {
        const columns = (await this.parent.getChildren()) as ColumnNode[]
        const afterColumnNode = columns[this.index + 1];
        if (!afterColumnNode) {
            vscode.window.showErrorMessage("Column is at last.")
            return;
        }
        const sql = `ALTER TABLE ${this.wrap(this.database)}.${this.wrap(this.table)} MODIFY COLUMN ${this.wrap(this.column.name)} ${this.column.type} AFTER ${this.wrap(afterColumnNode.column.name)};`
        await QueryUnit.queryPromise(await ConnectionManager.getConnection(this), sql)
        DbTreeDataProvider.refresh(this.parent)
    }
    public async moveUp() {
        const columns = (await this.parent.getChildren()) as ColumnNode[]
        const beforeColumnNode = columns[this.index - 1];
        if (!beforeColumnNode) {
            vscode.window.showErrorMessage("Column is at first.")
            return;
        }
        const sql = `ALTER TABLE ${this.wrap(this.database)}.${this.wrap(this.table)} MODIFY COLUMN ${this.wrap(beforeColumnNode.column.name)} ${beforeColumnNode.column.type} AFTER ${this.wrap(this.column.name)};`
        await QueryUnit.queryPromise(await ConnectionManager.getConnection(this), sql)
        DbTreeDataProvider.refresh(this.parent)
    }

}
