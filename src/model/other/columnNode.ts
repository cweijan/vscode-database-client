import { ColumnMeta } from "@/common/typeDef";
import * as vscode from "vscode";
import { DatabaseType, ModelType, Template } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { QueryUnit } from "../../service/queryUnit";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { TableNode } from "../main/tableNode";

export class ColumnNode extends Node implements CopyAble {
    public type: string;
    public contextValue: string = ModelType.COLUMN;
    public isPrimaryKey = false;
    constructor(public readonly table: string, readonly column: ColumnMeta, readonly parent: TableNode, readonly index: number) {
        super(column.name)
        this.init(parent)
        this.updateInfo(column)
        if (this.isPrimaryKey) {
            if(Util.supportColorIcon()){
                this.iconPath = new vscode.ThemeIcon("key", new vscode.ThemeColor('charts.yellow'));
            }else{
                this.iconPath = new vscode.ThemeIcon("key");
            }
        } else {
            this.iconPath = new vscode.ThemeIcon("symbol-field");
        }
        this.command = {
            command: "mysql.column.update",
            title: "Update Column Statement",
            arguments: [this, true],
        }
    }
    public copyName(): void {
        Util.copyToBoard(this.column.name)
    }

    public addColumnTemplate() {
        QueryUnit.showSQLTextDocument(this, this.dialect.addColumn(this.wrap(this.table),this.label), Template.alter);
    }

    public updateInfo(column: ColumnMeta) {
        if(!column.simpleType){
            column.simpleType=column.type
        }
        // sqlite
        if(column.pk=='1'){
            this.isPrimaryKey=true;
            this.parent.primaryKey= column.name;
            column.isPrimary=true;
        }
        if (column.extra == 'auto_increment') {
            column.isAutoIncrement = true;
        }
        column.isNotNull = column.nullable != 'YES'
        this.type = `${column.type}`
        this.description = `${column.type} ${column.comment||''}`
        this.tooltip = `${this.label} ${column.comment}
${column.type} ${column.nullable == "YES" ? "Nullable" : "NotNull"}`
        const columnKey: string = column.key;
        switch (columnKey) {
            case 'UNI':
            case 'UNIQUE':
                column.isUnique = true;
                return "UniqueKey";
            case 'MUL': return "IndexKey";
            case 'PRI':
            case 'PRIMARY KEY':
                this.isPrimaryKey = true
                this.parent.primaryKey=column.name;
                column.isPrimary = true
                return "PrimaryKey";
        }
        return '';
    }


    public async getChildren(): Promise<Node[]> {
        return [];
    }

    public updateColumnTemplate() {
        QueryUnit.showSQLTextDocument(this, this.dialect.updateColumn(this.table, this.column), Template.alter);

    }

    public createIndexTemplate() {
        const indexSql = this.dialect.createIndex({ column:this.wrap(this.column.name), type:"INDEX", indexType:null, table: this.wrap(this.table) });
        QueryUnit.showSQLTextDocument(this, indexSql, Template.alter);
    }

    public async dropColumnTemplate() {

        const dropSql = `ALTER TABLE \n\t${this.wrap(this.table)} DROP COLUMN ${this.wrap(this.column.name)};`;
        await QueryUnit.showSQLTextDocument(this, dropSql, Template.alter);
        Util.confirm(`Are you want to drop column ${this.column.name} ? `, async () => {
            this.execute(dropSql).then(() => {
                this.parent.setChildCache(null)
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
        const sql = `ALTER TABLE ${this.wrap(this.schema)}.${this.wrap(this.table)} MODIFY COLUMN ${this.wrap(this.column.name)} ${this.column.type} AFTER ${this.wrap(afterColumnNode.column.name)};`
        await this.execute(sql)
        this.parent.setChildCache(null)
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
        const sql = `ALTER TABLE ${this.wrap(this.schema)}.${this.wrap(this.table)} MODIFY COLUMN ${this.wrap(beforeColumnNode.column.name)} ${beforeColumnNode.column.type} AFTER ${this.wrap(this.column.name)};`
        await this.execute(sql)
        this.parent.setChildCache(null)
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
