import { CatalogNode } from "@/model/database/catalogNode";
import { SchemaNode } from "@/model/database/schemaNode";
import * as vscode from "vscode";
import { UserGroup } from "../../../model/database/userGroup";
import { ConnectionManager } from "../../../service/connectionManager";
import { ComplectionContext } from "../complectionContext";
import { BaseChain } from "./baseChain";

export class SchemaChain extends BaseChain {

    public getComplection(context: ComplectionContext) {
        const firstToken = context.tokens[0]?.content?.toLowerCase()
        if (!firstToken || ['select', 'insert', 'update', 'delete', 'call', 'execute'].indexOf(firstToken) == -1) {
            return null;
        }
        const previous = context.previousToken?.content?.toLowerCase()
        if (previous && previous.match(/into|from|update|table|join/ig)) {
            return this.generateDatabaseComplectionItem();
        }

        return null;
    }

    private async generateDatabaseComplectionItem() {

        const lcp = ConnectionManager.tryGetConnection() as (SchemaNode | CatalogNode)
        if (!lcp || !lcp?.parent?.getChildren) { return []; }

        const databaseNodes = await lcp.parent.getChildren()
        return databaseNodes.filter((databaseNode) => !(databaseNode instanceof UserGroup)).map<vscode.CompletionItem>((databaseNode) => {
            const label = databaseNode.label;
            const completionItem = new vscode.CompletionItem(label);
            completionItem.kind = vscode.CompletionItemKind.Folder;
            completionItem.insertText = lcp.wrap(label);
            return completionItem;
        });
    }

}

