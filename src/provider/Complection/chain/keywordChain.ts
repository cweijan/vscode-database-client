import * as vscode from "vscode";
import {ComplectionChain, ComplectionContext} from "../complectionContext";

export class KeywordChain implements ComplectionChain {

    // TODO 需要再细分, 分为ON和WHERE才能使用的条件
    private keywordList: string[] = ["JOIN", "SELECT", "UPDATE", "DELETE", "TABLE", "INSERT", "INTO", "VALUES", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "ALTER", "CREATE", "DROP", "FUNCTION", "CASE", "PROCEDURE", "TRIGGER", "INDEX", "CHANGE", "COLUMN", "ADD", 'SHOW', "PRIVILEGES", "IDENTIFIED", "VIEW", "CURSOR", "EXPLAIN"];
    private functionList: string[] = ["decimal", "char", "varchar", "CHAR_LENGTH", "CONCAT", "NOW", "DATE_ADD", "DATE_SUB", "MAX", "COUNT", "MIN", "SUM", "AVG", "LENGTH", "IF", "IFNULL", "MD5", "SHA", "CURRENT_DATE", "DATE_FORMAT", "CAST"];
    private defaultComplectionItems: vscode.CompletionItem[] = [];

    constructor() {
        this.keywordList.forEach((keyword) => {
            const keywordComplectionItem = new vscode.CompletionItem(keyword + " ");
            keywordComplectionItem.kind = vscode.CompletionItemKind.Property;
            this.defaultComplectionItems.push(keywordComplectionItem);
        });
        this.functionList.forEach((keyword) => {
            const functionComplectionItem = new vscode.CompletionItem(keyword + " ");
            functionComplectionItem.kind = vscode.CompletionItemKind.Function;
            functionComplectionItem.insertText = new vscode.SnippetString(keyword + "($1)");
            this.defaultComplectionItems.push(functionComplectionItem);
        });
    }

    public getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] {
        return this.defaultComplectionItems;
    }

    public stop(): boolean {
        return true;
    }
}
