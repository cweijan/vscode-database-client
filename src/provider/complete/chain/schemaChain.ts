import { CatalogNode } from "@/model/database/catalogNode";
import { SchemaNode } from "@/model/database/schemaNode";
import * as vscode from "vscode";
import { UserGroup } from "../../../model/database/userGroup";
import { ConnectionManager } from "../../../service/connectionManager";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export class SchemaChain implements ComplectionChain {

    public getComplection(complectionContext: ComplectionContext) {
        if (complectionContext.preWord && complectionContext.preWord.match(/into|from|update|table|join/ig)) {
            return this.generateDatabaseComplectionItem();
        }
        return null;
    }

    public stop(): boolean {
        return false;
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

