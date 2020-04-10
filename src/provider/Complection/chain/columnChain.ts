import * as vscode from "vscode";
import { DatabaseCache } from "../../../database/DatabaseCache";
import { ColumnNode } from "../../../model/table/columnNode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export class ColumnChain implements ComplectionChain {

    public async getComplection(complectionContext: ComplectionContext): Promise<vscode.CompletionItem[]> {

        if (complectionContext.preChart === ".") {
            let subComplectionItems = await this.generateColumnComplectionItem(complectionContext.preWord);
            const tableReg = new RegExp("`{0,1}(\\w|-)+`{0,1}(?=\\s*\\b" + complectionContext.preWord + "\\b)", "ig");
            let result = tableReg.exec(complectionContext.currentSql);
            for (; result != null && subComplectionItems.length === 0;) {
                subComplectionItems = await this.generateColumnComplectionItem(result[0].replace(/`/ig, ""));
                result = tableReg.exec(complectionContext.currentSql);
            }
            return subComplectionItems;
        }

        return null;
    }

    public stop(): boolean {
        return true;
    }

    private async generateColumnComplectionItem(inputWord: string): Promise<vscode.CompletionItem[]> {

        if (!inputWord) {
            return [];
        }
        let columnNodes: ColumnNode[] = [];

        for (const tableNode of DatabaseCache.getTableNodeList()) {
            if (tableNode.table === inputWord) {
                columnNodes = (await tableNode.getChildren()) as ColumnNode[];
                break;
            }
        }

        return columnNodes.map<vscode.CompletionItem>((columnNode) => {
            const completionItem = new vscode.CompletionItem(columnNode.getTreeItem().columnName);
            completionItem.detail = columnNode.getTreeItem().detail;
            completionItem.documentation = columnNode.getTreeItem().document;
            completionItem.kind = vscode.CompletionItemKind.Function;
            return completionItem;
        });
    }

}
