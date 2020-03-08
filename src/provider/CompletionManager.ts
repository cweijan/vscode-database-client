import * as vscode from "vscode";
import { DatabaseCache } from "../database/DatabaseCache";
import { DatabaseNode } from "../model/database/databaseNode";
import { ColumnNode } from "../model/table/columnNode";
import { TableNode } from "../model/table/tableNode";
import { INode } from "../model/INode";
import { Util } from "../common/util";
import { ModelType } from "../common/Constants";

export class CompletionManager {

    private keywordList: string[] = ["SELECT", "UPDATE", "DELETE", "TABLE", "INSERT", "INTO", "VALUES", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "ALTER", "CREATE", "DROP", "FUNCTION", "PROCEDURE", "TRIGGER","INDEX","CHANGE","COMMENT","COLUMN","ADD",'SHOW',"PRIVILEGES","IDENTIFIED","VIEW","CURSOR"]
    private keywordComplectionItems: vscode.CompletionItem[] = []

    getComplectionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {

        let completionItems = []

        const prePostion = position.character == 0 ? position : new vscode.Position(position.line, position.character - 1);
        const preChart = document.getText(new vscode.Range(prePostion, position))
        if (preChart != "." && preChart != " ") {
            completionItems = completionItems.concat(this.keywordComplectionItems)
        }
        if ((position.character == 0)) return completionItems

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

        let databaseNodes = DatabaseCache.getDatabaseNodeList()
        return databaseNodes.map<vscode.CompletionItem>(databaseNode => {
            let completionItem = new vscode.CompletionItem(databaseNode.getTreeItem().label)
            completionItem.kind = vscode.CompletionItemKind.Struct
            return completionItem
        })
    }

    private generateTableComplectionItem(inputWord?: string): vscode.CompletionItem[] {

        let tableNodes: INode[] = []
        if (inputWord) {
            DatabaseCache.getDatabaseNodeList().forEach(databaseNode => {
                if (databaseNode.database == inputWord) tableNodes = DatabaseCache.getTableListOfDatabase(databaseNode.identify)
            })
        } else {
            tableNodes = DatabaseCache.getTableNodeList()
        }

        return tableNodes.map<vscode.CompletionItem>((tableNode: TableNode) => {
            let treeItem = tableNode.getTreeItem();
            let completionItem = new vscode.CompletionItem(treeItem.label)
            switch (tableNode.type) {
                case ModelType.TABLE:
                    completionItem.kind = vscode.CompletionItemKind.Function;
                    break;
                case ModelType.VIEW:
                    completionItem.kind = vscode.CompletionItemKind.Module;
                    break;
                case ModelType.PROCEDURE:
                    completionItem.kind = vscode.CompletionItemKind.Reference;
                    break;
                case ModelType.FUNCTION:
                    completionItem.kind = vscode.CompletionItemKind.Method;
                    break;
                case ModelType.TRIGGER:
                    completionItem.kind = vscode.CompletionItemKind.Event;
                    break;
            }


            return completionItem
        })
    }

    generateColumnComplectionItem(inputWord: string): vscode.CompletionItem[] {

        if (!inputWord) return []
        let columnNodes: ColumnNode[] = []
        DatabaseCache.getTableNodeList().forEach(tableNode => {
            if (tableNode.table == inputWord) columnNodes = DatabaseCache.getColumnListOfTable(tableNode.identify)
        })

        return columnNodes.map<vscode.CompletionItem>(columnNode => {
            let completionItem = new vscode.CompletionItem(columnNode.getTreeItem().columnName)
            completionItem.detail = columnNode.getTreeItem().detail
            completionItem.documentation = columnNode.getTreeItem().document
            completionItem.kind = vscode.CompletionItemKind.Function
            return completionItem
        })
    }

}