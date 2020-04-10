import * as vscode from "vscode";
import {DatabaseCache} from "../../../database/DatabaseCache";
import {ComplectionChain, ComplectionContext} from "../complectionContext";

function wrap(origin: string): string {
    if (origin != null && origin.match(/\b(-)\b/ig)) {
        return `\`${origin}\``;
    }
    return origin;
}

export class DatabaseChain implements ComplectionChain {

    public getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] {
        if (complectionContext.preWord && complectionContext.preWord.match(/into|from|update|table|join/ig)) {
            return this.generateDatabaseComplectionItem();
        }
        return null;
    }

    public stop(): boolean {
        return false;
    }

    private generateDatabaseComplectionItem(): vscode.CompletionItem[] {

        const databaseNodes = DatabaseCache.getDatabaseNodeList();
        return databaseNodes.map<vscode.CompletionItem>((databaseNode) => {
            const label = databaseNode.getTreeItem().label;
            const completionItem = new vscode.CompletionItem(label);
            completionItem.kind = vscode.CompletionItemKind.Struct;
            completionItem.insertText = wrap(label);
            return completionItem;
        });
    }

}

