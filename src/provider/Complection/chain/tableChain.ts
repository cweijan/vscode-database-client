import * as vscode from "vscode";
import {ModelType} from "../../../common/Constants";
import {DatabaseCache} from "../../../database/DatabaseCache";
import {INode} from "../../../model/INode";
import {TableNode} from "../../../model/table/tableNode";
import {ComplectionChain, ComplectionContext} from "../complectionContext";

function wrap(origin: string): string {
    if (origin != null && origin.match(/\b(-)\b/ig)) {
        return `\`${origin}\``;
    }
    return origin;
}

export class TableChain implements ComplectionChain {
    public getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] {
        if (complectionContext.preChart == ".") {
            return this.generateTableComplectionItem(complectionContext.preWord);
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

        let tableNodes: INode[] = [];
        const tableNames: string[] = [];
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
                return !included && !tableNode.database.match(/(mysql|performance_schema|information_schema|sys)/ig);
            });
        }

        return tableNodes.map<vscode.CompletionItem>((tableNode: TableNode) => {
            const treeItem = tableNode.getTreeItem();
            const label = treeItem.label;
            const completionItem = new vscode.CompletionItem(label);
            completionItem.insertText = wrap(label);
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
