import * as vscode from "vscode";
import { ModelType } from "../common/Constants";
import { DatabaseCache } from "../database/DatabaseCache";
import { INode } from "../model/INode";
import { ColumnNode } from "../model/table/columnNode";
import { TableNode } from "../model/table/tableNode";
import { QueryUnit } from "../database/QueryUnit";

export class CompletionProvider implements vscode.CompletionItemProvider {
    constructor() {
        this.initDefaultComplectionItem()
    }
    private keywordList: string[] = ["SELECT", "UPDATE", "DELETE", "TABLE", "INSERT", "INTO", "VALUES", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "ALTER", "CREATE", "DROP", "FUNCTION", "CASE", "PROCEDURE", "TRIGGER", "INDEX", "CHANGE", "COLUMN", "ADD", 'SHOW', "PRIVILEGES", "IDENTIFIED", "VIEW", "CURSOR", "EXPLAIN"]
    private functionList: string[] = ["decimal", "char", "varchar", "CHAR_LENGTH", "CONCAT", "NOW", "DATE_ADD", "DATE_SUB", "MAX", "COUNT", "MIN", "SUM", "AVG", "LENGTH", "IF", "IFNULL", "MD5", "SHA", "CURRENT_DATE", "DATE_FORMAT", "CAST"]
    private defaultComplectionItems: vscode.CompletionItem[] = []
    private tableKeywordList: string[] = ["AUTO_INCREMENT", "NULL", "NOT", "PRIMARY", "CURRENT_TIME", "DEFAULT", "COMMENT", "UNIQUE", "KEY"]
    private tableKeywordComplectionItems: vscode.CompletionItem[] = []
    private typeList: string[] = ["INTEGER","char","varchar", "smallint", "tinyint", "MEDIUMINT", "bigint", "numeric", "bit", "long", "int", "float", "double", "TEXT", "SET", "blob", "timestamp", "date", "time", "YEAR", "datetime"]
    private typeComplectionItems: vscode.CompletionItem[] = []

    private initDefaultComplectionItem() {
        this.keywordList.forEach(keyword => {
            let keywordComplectionItem = new vscode.CompletionItem(keyword + " ")
            keywordComplectionItem.kind = vscode.CompletionItemKind.Property
            this.defaultComplectionItems.push(keywordComplectionItem)
        })
        this.functionList.forEach(keyword => {
            let functionComplectionItem = new vscode.CompletionItem(keyword + " ")
            functionComplectionItem.kind = vscode.CompletionItemKind.Function
            functionComplectionItem.insertText = new vscode.SnippetString(keyword + "($1)")
            this.defaultComplectionItems.push(functionComplectionItem)
        })
        this.tableKeywordList.forEach(keyword => {
            let keywordComplectionItem = new vscode.CompletionItem(keyword + " ")
            keywordComplectionItem.kind = vscode.CompletionItemKind.Property
            this.tableKeywordComplectionItems.push(keywordComplectionItem)
        })
        this.typeList.forEach(columnType => {
            let columnTypeComplectionItem = new vscode.CompletionItem(columnType + " ")
            columnTypeComplectionItem.kind = vscode.CompletionItemKind.TypeParameter
            this.typeComplectionItems.push(columnTypeComplectionItem)
        })
    }

    private createReg = /CREATE TABLE/ig;
    private programReg = /(FUNCTION|PROCEDURE)/ig;
    /**
     * Main function
     * @param document 
     * @param position 
     */
    async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {

        var sql = QueryUnit.obtainSql(vscode.window.activeTextEditor)
        if (sql && sql.match(this.createReg)) {
            return this.typeComplectionItems.concat(this.tableKeywordComplectionItems);
        }

        let completionItems = [];

        const prePostion = position.character == 0 ? position : new vscode.Position(position.line, position.character - 1);
        const preChart = document.getText(new vscode.Range(prePostion, position))

        if (preChart != "." && sql && sql.match(this.programReg)) {
            completionItems = this.typeComplectionItems
        }
        if (preChart != "." && preChart != " ") {
            completionItems = completionItems.concat(this.defaultComplectionItems)
        }
        if ((position.character == 0)) return completionItems

        let wordRange = document.getWordRangeAtPosition(prePostion)
        const inputWord = document.getText(wordRange)
        if (inputWord && preChart == '.') {
            let subComplectionItems = this.generateTableComplectionItem(inputWord)
            if (subComplectionItems.length == 0) {
                subComplectionItems = await CompletionProvider.generateColumnComplectionItem(inputWord)
                if (subComplectionItems.length == 0) {
                    let tableReg = new RegExp("\\w+(?=\\s*\\b" + inputWord + "\\b)", 'ig')
                    let currentSql = document.getText();
                    let result = tableReg.exec(currentSql)
                    for (; result != null && subComplectionItems.length == 0;) {
                        subComplectionItems = await CompletionProvider.generateColumnComplectionItem(result[0])
                        result = tableReg.exec(currentSql)
                    }
                }
            }
            completionItems = completionItems.concat(subComplectionItems)
        } else {
            completionItems = completionItems.concat(this.generateDatabaseComplectionItem(), this.generateTableComplectionItem())
        }

        return completionItems
    }
    resolveCompletionItem?(item: vscode.CompletionItem): vscode.ProviderResult<vscode.CompletionItem> {

        return item;
    }

    private generateDatabaseComplectionItem(): vscode.CompletionItem[] {

        let databaseNodes = DatabaseCache.getDatabaseNodeList()
        return databaseNodes.map<vscode.CompletionItem>(databaseNode => {
            let completionItem = new vscode.CompletionItem(databaseNode.getTreeItem().label)
            completionItem.kind = vscode.CompletionItemKind.Struct
            return completionItem
        })
    }

    private blockDbReg = /(mysql|performance_schema|information_schema)/ig
    private generateTableComplectionItem(inputWord?: string): vscode.CompletionItem[] {

        let tableNodes: INode[] = []
        if (inputWord) {
            DatabaseCache.getDatabaseNodeList().forEach(databaseNode => {
                if (databaseNode.database == inputWord) tableNodes = DatabaseCache.getTableListOfDatabase(databaseNode.identify)
            })
        } else {
            tableNodes = DatabaseCache.getTableNodeList().filter(databaseNode => {
                return !databaseNode.database.match(this.blockDbReg)
            })
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

    static async generateColumnComplectionItem(inputWord: string): Promise<vscode.CompletionItem[]> {

        if (!inputWord) return []
        let columnNodes: ColumnNode[] = []

        for (const tableNode of DatabaseCache.getTableNodeList()) {
            if (tableNode.table == inputWord) {
                columnNodes = (await tableNode.getChildren()) as ColumnNode[]
                break;
            }
        }

        return columnNodes.map<vscode.CompletionItem>(columnNode => {
            let completionItem = new vscode.CompletionItem(columnNode.getTreeItem().columnName)
            completionItem.detail = columnNode.getTreeItem().detail
            completionItem.documentation = columnNode.getTreeItem().document
            completionItem.kind = vscode.CompletionItemKind.Function
            return completionItem
        })
    }


}