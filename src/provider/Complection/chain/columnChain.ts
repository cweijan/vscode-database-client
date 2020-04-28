import * as vscode from "vscode";
import { DatabaseCache } from "../../../service/common/databaseCache";
import { ColumnNode } from "../../../model/other/columnNode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";
import { Util } from "../../../common/util";
import { Pattern } from "../../../common/Constants";
import { ConnectionManager } from "../../../service/connectionManager";

export class ColumnChain implements ComplectionChain {

    private needStop = true;
    public async getComplection(complectionContext: ComplectionContext): Promise<vscode.CompletionItem[]> {

        if (complectionContext.preChart === ".") {
            let subComplectionItems = await this.generateColumnComplectionItem(complectionContext.preWord);
            if (subComplectionItems != null && subComplectionItems.length > 0) { this.needStop = true }
            const tableReg = new RegExp(Pattern.TABLE_PATTERN + "(?=\\s*\\b" + complectionContext.preWord + "\\b)", "ig");
            let result = tableReg.exec(complectionContext.currentSqlFull);
            for (; result != null && subComplectionItems.length === 0;) {
                subComplectionItems = await this.generateColumnComplectionItem(
                    Util.getTableName(result[0], Pattern.TABLE_PATTERN)
                );
                this.needStop = true;
                if (subComplectionItems.length > 0) {
                    break;
                }
                result = tableReg.exec(complectionContext.currentSqlFull);
            }
            return subComplectionItems;
        }

        if (complectionContext.currentSqlFull.match(/\bwhere\b/ig)) {
            const updateTableName = Util.getTableName(complectionContext.currentSql, Pattern.TABLE_PATTERN)
            if (updateTableName) {
                this.needStop = false;
                return await this.generateColumnComplectionItem(updateTableName);
            }
        }

        const dmlTableName = Util.getTableName(complectionContext.currentSql, Pattern.DML_PATTERN)
        if (dmlTableName) {
            this.needStop = complectionContext.currentSql.match(/\binsert\b/ig) != null;
            return await this.generateColumnComplectionItem(dmlTableName);
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
        if (!lcp) { return []; }
        const id = `${lcp.getConnectId()}_${lcp.database}_${tableName}`;

        for (const tableNode of DatabaseCache.getTableNodeList()) {
            if ((tableNode.table == tableName) ||
                (tableNode.id === id)) {
                columnNodes = (await tableNode.getChildren()) as ColumnNode[];
                break;
            }
        }

        return columnNodes.map<vscode.CompletionItem>((columnNode) => {
            const completionItem = new vscode.CompletionItem(columnNode.label);
            completionItem.detail = columnNode.type;
            completionItem.documentation = columnNode.comment;
            completionItem.insertText = columnNode.column.name
            completionItem.kind = vscode.CompletionItemKind.Field;
            return completionItem;
        });
    }

}
