import * as vscode from "vscode";
import { DatabaseCache } from "../../../database/DatabaseCache";
import { ComplectionChain, ComplectionContext } from "../complectionContext";
import { ConnectionManager } from "../../../database/ConnectionManager";

function wrap(origin: string): string {
    if (origin != null && origin.match(/\b(-|\.)\b/ig)) {
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

        const lcp = ConnectionManager.getLastConnectionOption()
        if (!lcp) { return []; }
        const connectcionid = `${lcp.host}_${lcp.port}_${lcp.user}`;

        const databaseNodes = DatabaseCache.getDatabaseListOfConnection(connectcionid);

        return databaseNodes.map<vscode.CompletionItem>((databaseNode) => {
            const label = databaseNode.label;
            const completionItem = new vscode.CompletionItem(label);
            completionItem.kind = vscode.CompletionItemKind.Folder;
            completionItem.insertText = wrap(label);
            return completionItem;
        });
    }

}

