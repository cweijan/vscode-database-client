import * as vscode from "vscode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export class TypeKeywordChain implements ComplectionChain {

    private typeList: string[] = ["INTEGER", "CHAR", "VARCHAR", "DECIMAL", "SMALLINT", "TINYINT", "MEDIUMINT", "BIGINT",
        "NUMERIC", "BIT", "INT", "FLOAT", "DOUBLE", "TEXT", "SET", "BLOB", "TIMESTAMP", "DATE", "TIME", "YEAR", "DATETIME"];
    private typeComplectionItems: vscode.CompletionItem[] = [];
    private needStop = false;

    constructor() {
        this.typeList.forEach((columnType) => {
            const columnTypeComplectionItem = new vscode.CompletionItem(columnType + " ");
            columnTypeComplectionItem.kind = vscode.CompletionItemKind.Variable;
            this.typeComplectionItems.push(columnTypeComplectionItem);
        });
    }

    public getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] {
        const sql = complectionContext.currentSql;
        if (sql && sql.match(/CREATE TABLE/ig)) {
            this.needStop = true;
            return this.typeComplectionItems;
        }
        if (sql && sql.match(/\b(FUNCTION|PROCEDURE)\b/ig)) {
            this.needStop = false;
            return this.typeComplectionItems;
        }
        return null;
    }

    public stop(): boolean {
        return this.needStop;
    }

}
