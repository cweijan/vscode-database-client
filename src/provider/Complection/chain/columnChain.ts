import * as vscode from "vscode";
import { DatabaseCache } from "../../../database/DatabaseCache";
import { ColumnNode } from "../../../model/table/columnNode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";
import { Util } from "../../../common/util";
import { Pattern } from "../../../common/Constants";
import { ConnectionManager } from "../../../database/ConnectionManager";

export class ColumnChain implements ComplectionChain {

    private tablePatternStr = "\\b(from|join|update)\\b\\s*`{0,1}(\\w|\\.|-)+`{0,1}";
    private needStop = true;
    public async getComplection(complectionContext: ComplectionContext): Promise<vscode.CompletionItem[]> {

        if (complectionContext.preChart === ".") {
            let subComplectionItems = await this.generateColumnComplectionItem(complectionContext.preWord);
            const tableReg = new RegExp(this.tablePatternStr + "(?=\\s*\\b" + complectionContext.preWord + "\\b)", "ig");
            let result = tableReg.exec(complectionContext.currentSqlFull);
            for (; result != null && subComplectionItems.length === 0;) {
                subComplectionItems = await this.generateColumnComplectionItem(
                    Util.getTableName(result[0], Pattern.TABLE_PATTERN)
                );
                if (subComplectionItems.length > 0) {
                    break;
                }
                this.needStop = true;
                result = tableReg.exec(complectionContext.currentSqlFull);
            }
            return subComplectionItems;
        }

        const tableName = Util.getTableName(complectionContext.currentSql, Pattern.DML_PATTERN)
        if (tableName) {
            this.needStop = complectionContext.currentSql.match(/\binsert\b/ig) != null;
            return await this.generateColumnComplectionItem(tableName);
        }


        return null;
    }

    public stop(): boolean {
        return this.needStop;
    }

    private async generateColumnComplectionItem(tableName: string): Promise<vscode.CompletionItem[]> {

        if (!tableName) {
            return [];
        }
        let columnNodes: ColumnNode[] = [];


        const lcp = ConnectionManager.getLastConnectionOption()
        const id = `${lcp.host}_${lcp.port}_${lcp.user}_${lcp.database}_${tableName}`;

        for (const tableNode of DatabaseCache.getTableNodeList()) {
            if (tableNode.id === id) {
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
