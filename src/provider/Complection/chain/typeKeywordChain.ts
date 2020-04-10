import * as vscode from "vscode";
import {ComplectionChain, ComplectionContext} from "../complectionContext";

export class TypeKeywordChain implements ComplectionChain {
    private typeList: string[] = ["INTEGER", "char", "varchar", "smallint", "tinyint", "MEDIUMINT", "bigint", "numeric", "bit", "int", "float", "double", "TEXT", "SET", "blob", "timestamp", "date", "time", "YEAR", "datetime"];
    private typeComplectionItems: vscode.CompletionItem[] = [];
    private needStop = false;

    constructor() {
        this.typeList.forEach((columnType) => {
            const columnTypeComplectionItem = new vscode.CompletionItem(columnType + " ");
            columnTypeComplectionItem.kind = vscode.CompletionItemKind.TypeParameter;
            this.typeComplectionItems.push(columnTypeComplectionItem);
        });
    }

    public getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] {
        const sql = complectionContext.currentSql;
        if (sql && sql.match(/CREATE TABLE/ig)) {
            this.needStop = true;
            return this.typeComplectionItems;
        }
        if (sql && sql.match(/(FUNCTION|PROCEDURE)/ig)) {
            this.needStop = false;
            return this.typeComplectionItems;
        }
        return null;
    }

    public stop(): boolean {
        return this.needStop;
    }

}
