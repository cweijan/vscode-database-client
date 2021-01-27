import { MockRunner } from "@/service/mock/mockRunner";
import * as path from "path";
import * as vscode from "vscode";
import { Constants, DatabaseType, ModelType, Template } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { ColumnMeta } from "./columnMeta";

export class ColumnNode extends Node implements CopyAble {
    public type: string;
    public contextValue: string = ModelType.COLUMN;
    public isPrimaryKey = false;
    constructor(public readonly table: string, readonly column: ColumnMeta, readonly parent: Node, readonly index: number) {
        super(column.name)
        this.init(parent)
        this.type = `${this.column.type}`
        this.description = `${this.column.type} ${this.column.nullable == "YES" ? "Nullable" : "NotNull"} ${this.column.comment}`
        if (column && this.isPrimaryKey) {
            MockRunner.primaryKeyMap[this.parent.uid] = column.name
        }
        this.collapsibleState = vscode.TreeItemCollapsibleState.None
        this.iconPath = path.join(Constants.RES_PATH, this.isPrimaryKey ? "icon/b_primary.png" : "icon/b_props.png");
        this.command = {
            command: "mysql.column.update",
            title: "Update Column Statement",
            arguments: [this, true],
        }
        this.buildInfo()
    }
    public copyName(): void {
        Util.copyToBoard(this.column.name)
    }

    private buildInfo() {
        if (this.column.extra == 'auto_increment') {
            this.column.isAutoIncrement = true;
        }
        this.column.isNotNull = this.column.nullable != 'YES'
        const columnKey: string = this.column.key;
        switch (columnKey) {
            case 'UNI':
            case 'UNIQUE':
                this.column.isUnique = true;
                return "UniqueKey";
            case 'MUL': return "IndexKey";
            case 'PRI':
            case 'PRIMARY KEY':
                this.isPrimaryKey = true
                this.column.isPrimary = true
                return "PrimaryKey";
        }
        return '';
    }


    public async getChildren(): Promise<Node[]> {
        return [];
    }

    public updateColumnTemplate() {
        QueryUnit.showSQLTextDocument(this, this.dialect.updateColumn(this.table, this.column.name, this.column.type, this.column.comment, this.column.nullable), Template.alter);

    }
    public async dropColumnTemplate() {

        const dropSql = `ALTER TABLE \n\t${this.wrap(this.table)} DROP COLUMN ${this.wrap(this.column.name)};`;
        await QueryUnit.showSQLTextDocument(this, dropSql, Template.alter);
        Util.confirm(`Are you want to drop column ${this.column.name} ? `, async () => {
            this.execute(dropSql).then(() => {
                DatabaseCache.setChildCache(`${this.parent.uid}`,null);
                DbTreeDataProvider.refresh(this.parent);
            })
        })

    }


    public async moveDown() {
        this.check()
        const columns = (await this.parent.getChildren()) as ColumnNode[]
        const afterColumnNode = columns[this.index + 1];
        if (!afterColumnNode) {
            vscode.window.showErrorMessage("Column is at last.")
            return;
        }
        const sql = `ALTER TABLE ${this.wrap(this.database)}.${this.wrap(this.table)} MODIFY COLUMN ${this.wrap(this.column.name)} ${this.column.type} AFTER ${this.wrap(afterColumnNode.column.name)};`
        await this.execute(sql)
        DatabaseCache.setChildCache(this.parent.uid,null)
        DbTreeDataProvider.refresh(this.parent)
    }
    public async moveUp() {
        this.check()
        const columns = (await this.parent.getChildren()) as ColumnNode[]
        const beforeColumnNode = columns[this.index - 1];
        if (!beforeColumnNode) {
            vscode.window.showErrorMessage("Column is at first.")
            return;
        }
        const sql = `ALTER TABLE ${this.wrap(this.database)}.${this.wrap(this.table)} MODIFY COLUMN ${this.wrap(beforeColumnNode.column.name)} ${beforeColumnNode.column.type} AFTER ${this.wrap(this.column.name)};`
        await this.execute(sql)
        DatabaseCache.setChildCache(this.parent.uid,null)
        DbTreeDataProvider.refresh(this.parent)
    }

    check() {
        if (this.dbType == DatabaseType.MYSQL || !this.dbType) {
            return;
        }
        vscode.window.showErrorMessage("Only mysql support change column position.")
        throw new Error("Only mysql support change column position.");
    }

}
