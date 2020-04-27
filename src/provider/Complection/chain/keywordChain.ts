import * as vscode from "vscode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export class KeywordChain implements ComplectionChain {

    private keywordList: string[] = ["JOIN", "AND", "OR", "SELECT", "SET", "UPDATE", "DELETE", "TABLE", "INSERT", "INTO", "VALUES", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "ALTER", "CREATE", "DROP", "FUNCTION", "CASE", "PROCEDURE", "TRIGGER", "INDEX", "CHANGE", "COLUMN", "ADD", 'SHOW', "PRIVILEGES", "IDENTIFIED", "VIEW", "CURSOR", "EXPLAIN", "COMMENT", "rollback", "commit", "begin", "DELIMITER", "CALL"];
    private keywordComplectionItems: vscode.CompletionItem[] = [];

    constructor() {
        this.keywordList.forEach((keyword) => {
            const keywordComplectionItem = new vscode.CompletionItem(keyword + " ");
            keywordComplectionItem.kind = vscode.CompletionItemKind.Keyword;
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
