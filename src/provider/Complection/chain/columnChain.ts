import * as vscode from "vscode";
import { DatabaseCache } from "../../../database/DatabaseCache";
import { ColumnNode } from "../../../model/table/columnNode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export class ColumnChain implements ComplectionChain {

    public async getComplection(complectionContext: ComplectionContext): Promise<vscode.CompletionItem[]> {

        if (complectionContext.preChart === ".") {
            let subComplectionItems = await this.generateColumnComplectionItem(complectionContext.preWord);
            const tableReg = new RegExp("\\b(from|join)\\b\\s*`{0,1}(\\w|\\.|-)+`{0,1}(?=\\s*\\b" + complectionContext.preWord + "\\b)", "ig");
            let result = tableReg.exec(complectionContext.currentSqlFull);
            for (; result != null && subComplectionItems.length === 0;) {
                subComplectionItems = await this.generateColumnComplectionItem(
                    result[0].trim().replace(/(\w|\s)*\./, "").replace(/`/ig, ""),
                );
                if (subComplectionItems.length > 0) {
                    break;
                }
                result = tableReg.exec(complectionContext.currentSqlFull);
            }
            return subComplectionItems;
        }

        return null;
    }

    public stop(): boolean {
        return true;
    }

    private async generateColumnComplectionItem(tableName: string): Promise<vscode.CompletionItem[]> {

        if (!tableName) {
            return [];
        }
        let columnNodes: ColumnNode[] = [];

        for (const tableNode of DatabaseCache.getTableNodeList()) {
            if (tableNode.table === tableName) {
                columnNodes = (await tableNode.getChildren()) as ColumnNode[];
                break;
            }
        }

        return columnNodes.map<vscode.CompletionItem>((columnNode) => {
            const completionItem = new vscode.CompletionItem(columnNode.getTreeItem().columnName);
            completionItem.detail = columnNode.getTreeItem().detail;
            completionItem.documentation = columnNode.getTreeItem().document;
            completionItem.kind = vscode.CompletionItemKind.Field;
            return completionItem;
        });
    }

}
