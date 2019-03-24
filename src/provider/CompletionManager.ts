import * as vscode from "vscode";
import { DatabaseCache } from "../database/DatabaseCache";

export class CompletionManager {

    private keywordList: string[] = ["SELECT", "UPDATE", "DELETE", "INSERT", "INTO", "VALUES", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "ALTER"]
    private keywordComplectionItems: vscode.CompletionItem[] = []

    getComplectionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {

        let completionItems = []

        const prePostion = new vscode.Position(position.line, position.character - 1);
        const preChart = document.getText(new vscode.Range(prePostion, position))
        if (preChart != "." && preChart != " ") {
            completionItems = completionItems.concat(this.keywordComplectionItems)
        }

        let wordRange = document.getWordRangeAtPosition(prePostion)
        const inputWord = document.getText(wordRange)
        if (inputWord && preChart == '.') {
            let subComplectionItems = this.generateTableComplectionItem(inputWord)
            if (subComplectionItems.length == 0) {
                subComplectionItems = this.generateColumnComplectionItem(inputWord)
            }
            completionItems = completionItems.concat(subComplectionItems)
        } else {
            completionItems = completionItems.concat(this.generateDatabaseComplectionItem(), this.generateTableComplectionItem())
        }

        return completionItems
    }
    constructor() {
        this.initKeywordComplectionItem()
    }

    private initKeywordComplectionItem() {
        this.keywordList.forEach(keyword => {
            let keywordComplectionItem = new vscode.CompletionItem(keyword + " ")
            keywordComplectionItem.kind = vscode.CompletionItemKind.Property
            this.keywordComplectionItems.push(keywordComplectionItem)
        })
    }

    private generateDatabaseComplectionItem(): vscode.CompletionItem[] {

        return DatabaseCache.databaseNodes.map<vscode.CompletionItem>(databaseNode => {
            let completionItem = new vscode.CompletionItem(databaseNode.getTreeItem().label)
            completionItem.kind = vscode.CompletionItemKind.Class
            return completionItem
        })

    }

    generateColumnComplectionItem(inputWord: string): vscode.CompletionItem[] {
        return DatabaseCache.getColumnListOfTable(inputWord).map<vscode.CompletionItem>(columnNode => {
            let completionItem = new vscode.CompletionItem(columnNode.getTreeItem().columnName)
            completionItem.detail=columnNode.getTreeItem().detail
            completionItem.documentation=columnNode.getTreeItem().document

            completionItem.kind = vscode.CompletionItemKind.Function
            return completionItem
        })
    }

    private generateTableComplectionItem(word?: string): vscode.CompletionItem[] {
        let tableNodes = DatabaseCache.getTableNodeList()
        if (word) {
            tableNodes = DatabaseCache.getTableListOfDatabase(word)
        }
        return tableNodes.map<vscode.CompletionItem>(tableNode => {
            let completionItem = new vscode.CompletionItem(tableNode.getTreeItem().label)
            completionItem.kind = vscode.CompletionItemKind.Function
            return completionItem
        })
    }

}