import { TableGroup } from "@/model/main/tableGroup";
import { ViewGroup } from "@/model/main/viewGroup";
import { DatabaseCache } from "@/service/common/databaseCache";
import * as vscode from "vscode";
import { DatabaseType, ModelType } from "../../../common/constants";
import { TableNode } from "../../../model/main/tableNode";
import { ConnectionManager } from "../../../service/connectionManager";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

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
        const nodeList = await this.getNodeList(inputWord);
        return nodeList.map<vscode.CompletionItem>((tableNode: TableNode) => {
            const completionItem = new vscode.CompletionItem(tableNode.table);
            if (tableNode.description) {
                completionItem.detail = tableNode.description
            }
            if (tableNode.dbType == DatabaseType.MSSQL && tableNode.schema != inputWord) {
                completionItem.insertText = `${tableNode.wrap(tableNode.schema)}.${tableNode.wrap(tableNode.table)}`;
            } else {
                completionItem.insertText = tableNode.wrap(tableNode.table);
            }
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

    private async getNodeList(inputWord: string) {
        let nodeList = []
        let lcp = ConnectionManager.getLastConnectionOption();
        if (!lcp) return [];

        if (inputWord) {
            let match = false;
            const connectcionid = lcp.getConnectId();
            for (const databaseNode of DatabaseCache.getSchemaListOfConnection(connectcionid)) {
                if (databaseNode.schema === inputWord) {
                    lcp = databaseNode;
                    match = true;
                    break;
                }
            }
            if (!match) return []
        }

        const groupNodes = await lcp?.getByRegion()?.getChildren();
        if (!groupNodes) {
            return nodeList
        }
        for (const groupNode of groupNodes) {
            if (groupNode instanceof TableGroup || groupNode instanceof ViewGroup) {
                nodeList.push(...await groupNode.getChildren());
            }
        }
        return nodeList;
    }

}
