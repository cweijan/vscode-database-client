import * as vscode from "vscode";
import { ModelType } from "../../../common/constants";
import { DatabaseCache } from "../../../service/common/databaseCache";
import { Node } from "../../../model/interface/node";
import { TableNode } from "../../../model/main/tableNode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";
import { Util } from "../../../common/util";
import { ConnectionManager } from "../../../service/connectionManager";
import { TableGroup } from "../../../model/main/tableGroup";

export class TableChain implements ComplectionChain {

    public async getComplection(complectionContext: ComplectionContext): Promise<vscode.CompletionItem[]> {

        if (complectionContext.preChart == ".") {
            const temp = await this.generateTableComplectionItem(complectionContext.preWord);
            if (temp.length == 0) {
                return null;
            } else {
                return await this.generateTableComplectionItem(complectionContext.preWord);
            }

        }
        if (complectionContext.preWord && complectionContext.preWord.match(/\b(into|from|update|table|join)\b/ig)) {
            return await this.generateTableComplectionItem();
        }
        return null;
    }

    public stop(): boolean {
        return true;
    }

    private async generateTableComplectionItem(inputWord?: string): Promise<vscode.CompletionItem[]> {

        let tableNodes: Node[] = [];
        const tableNames: string[] = [];
        const lcp = ConnectionManager.getLastConnectionOption();
        if (!lcp) { return []; }
        if (!inputWord && lcp && lcp.database) {
            inputWord = lcp.database
        }
        if (inputWord) {
            const connectcionid = lcp.getConnectId();
            for (const databaseNode of DatabaseCache.getDatabaseListOfConnection(connectcionid)) {
                if (databaseNode.database === inputWord) {
                    tableNodes = DatabaseCache.getTableListOfDatabase(databaseNode.id);
                    if (tableNodes == null || tableNodes.length == 0) {
                        tableNodes = await new TableGroup(databaseNode.info).getChildren()
                    }
                }
            }
        } else {
            const databaseid = `${lcp.getConnectId()}_${lcp.database}`;
            const tableList = DatabaseCache.getTableListOfDatabase(databaseid);
            if (tableList == null) { return []; }
            tableNodes = tableList.filter((tableNode: TableNode) => {
                const included = tableNames.includes(tableNode.table);
                tableNames.push(tableNode.table);
                return !included && !tableNode.info.database.match(/\b(mysql|performance_schema|information_schema|sys)\b/ig);
            });
        }

        if (!tableNodes) { return [] }

        return tableNodes.map<vscode.CompletionItem>((tableNode: TableNode) => {
            const completionItem = new vscode.CompletionItem(tableNode.comment ? `${tableNode.table}  ${tableNode.comment}` : tableNode.table);
            completionItem.insertText = Util.wrap(tableNode.table);
            switch (tableNode.contextValue) {
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
