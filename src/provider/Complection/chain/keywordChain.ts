import * as vscode from "vscode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export class KeywordChain implements ComplectionChain {

    // TODO 需要再细分, 分为ON和WHERE才能使用的条件
    private keywordList: string[] = ["JOIN", "SELECT", "UPDATE", "DELETE", "TABLE", "INSERT", "INTO", "VALUES", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "ALTER", "CREATE", "DROP", "FUNCTION", "CASE", "PROCEDURE", "TRIGGER", "INDEX", "CHANGE", "COLUMN", "ADD", 'SHOW', "PRIVILEGES", "IDENTIFIED", "VIEW", "CURSOR", "EXPLAIN"];
    private keywordComplectionItems: vscode.CompletionItem[] = [];

    constructor() {
        this.keywordList.forEach((keyword) => {
            const keywordComplectionItem = new vscode.CompletionItem(keyword + " ");
            keywordComplectionItem.kind = vscode.CompletionItemKind.Property;
            this.keywordComplectionItems.push(keywordComplectionItem);
        });

    }

    public getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] {
        return this.keywordComplectionItems;
    }

    public stop(): boolean {
        return true;
    }
}
