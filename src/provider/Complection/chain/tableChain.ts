import * as vscode from "vscode";
import { ModelType } from "../../../common/Constants";
import { DatabaseCache } from "../../../database/DatabaseCache";
import { Node } from "../../../model/interface/node";
import { TableNode } from "../../../model/table/tableNode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";
import { Util } from "../../../common/util";
import { ConnectionManager } from "../../../database/ConnectionManager";

export class TableChain implements ComplectionChain {

    public getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] {
        if (complectionContext.preChart == ".") {
            const temp = this.generateTableComplectionItem(complectionContext.preWord);
            if (temp.length == 0) {
                return null;
            } else {
                return this.generateTableComplectionItem(complectionContext.preWord);
            }

        }
        if (complectionContext.preWord && complectionContext.preWord.match(/\b(into|from|update|table|join)\b/ig)) {
            return this.generateTableComplectionItem();
        }
        return null;
    }

    public stop(): boolean {
        return true;
    }

    private generateTableComplectionItem(inputWord?: string): vscode.CompletionItem[] {

        let tableNodes: Node[] = [];
        const tableNames: string[] = [];
        const lcp = ConnectionManager.getLastConnectionOption();
        if (!inputWord && lcp && lcp.database) {
            inputWord = lcp.database
        }
        if (inputWord) {
            DatabaseCache.getDatabaseNodeList().forEach((databaseNode) => {
                if (databaseNode.database === inputWord) {
                    tableNodes = DatabaseCache.getTableListOfDatabase(databaseNode.identify);
                }
            });
        } else {
            tableNodes = DatabaseCache.getTableNodeList().filter((tableNode) => {
                const included = tableNames.includes(tableNode.table);
                tableNames.push(tableNode.table);
                return !included && !tableNode.database.match(/\b(mysql|performance_schema|information_schema|sys)\b/ig);
            });
        }

        return tableNodes.map<vscode.CompletionItem>((tableNode: TableNode) => {
            const treeItem = tableNode.getTreeItem();
            const label = treeItem.label;
            const completionItem = new vscode.CompletionItem(label);
            completionItem.insertText = Util.wrap(label);
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

            return completionItem;
        });
    }
}
