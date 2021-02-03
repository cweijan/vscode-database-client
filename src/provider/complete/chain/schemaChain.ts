import * as vscode from "vscode";
import { DatabaseCache } from "../../../service/common/databaseCache";
import { ComplectionChain, ComplectionContext } from "../complectionContext";
import { ConnectionManager } from "../../../service/connectionManager";
import { UserGroup } from "../../../model/database/userGroup";

function wrap(origin: string): string {
    if (origin != null && origin.match(/\b(-|\.)\b/ig)) {
        return `\`${origin}\``;
    }
    return origin;
}

export class SchemaChain implements ComplectionChain {

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
        const connectcionid = `${lcp.getConnectId()}`;

        const databaseNodes = DatabaseCache.getSchemaListOfConnection(connectcionid);
        if (databaseNodes == null) { return []; }

        return databaseNodes.filter((databaseNode) => !(databaseNode instanceof UserGroup)).map<vscode.CompletionItem>((databaseNode) => {
            const label = databaseNode.label;
            const completionItem = new vscode.CompletionItem(label);
            completionItem.kind = vscode.CompletionItemKind.Folder;
            completionItem.insertText = wrap(label);
            return completionItem;
        });
    }

}

