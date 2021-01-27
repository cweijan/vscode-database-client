import { UserGroup } from "@/model/database/userGroup";
import { DiagramGroup } from "@/model/diagram/diagramGroup";
import { ProcedureGroup } from "@/model/main/procedureGroup";
import { TableGroup } from "@/model/main/tableGroup";
import { TriggerGroup } from "@/model/main/triggerGroup";
import { ViewGroup } from "@/model/main/viewGroup";
import { QueryGroup } from "@/model/query/queryGroup";
import * as vscode from "vscode";
import { ModelType } from "../../../common/constants";
import { TableNode } from "../../../model/main/tableNode";
import { ConnectionManager } from "../../../service/connectionManager";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export class TableChain implements ComplectionChain {

    public async getComplection(complectionContext: ComplectionContext): Promise<vscode.CompletionItem[]> {

        await this.getNodeList();
        if (complectionContext.preWord?.match(/\b(into|from|update|table|join)\b/ig)) {
            return await this.generateTableComplectionItem();
        }
        return null;
    }

    public stop(): boolean {
        return true;
    }

    private async generateTableComplectionItem(): Promise<vscode.CompletionItem[]> {
        const nodeList = await this.getNodeList();
        return nodeList.map<vscode.CompletionItem>((tableNode: TableNode) => {
            const completionItem = new vscode.CompletionItem(tableNode.table);
            if (tableNode.comment) {
                completionItem.detail = tableNode.comment
            }
            completionItem.insertText = tableNode.wrap(tableNode.table);
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

    private async getNodeList() {
        let nodeList = []
        const lcp = ConnectionManager.getLastConnectionOption();
        const groupNodes = await lcp?.getByRegion()?.getChildren();
        if (!groupNodes) {
            return nodeList
        }
        for (const groupNode of groupNodes) {
            if (groupNode instanceof TableGroup || groupNode instanceof ViewGroup){
                nodeList.push(...await groupNode.getChildren());
            }
        }
        return nodeList;
    }
}
