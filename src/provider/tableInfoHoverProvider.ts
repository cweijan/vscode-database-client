import { TableNode } from "@/model/main/tableNode";
import { ConnectionManager } from "@/service/connectionManager";
import * as vscode from "vscode";
import { HoverProvider } from "vscode";

export class TableInfoHoverProvider implements HoverProvider {

    public async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover> {


        const tableName = document.getText(document.getWordRangeAtPosition(position));
        const tableNode = ConnectionManager.getLastConnectionOption()?.getByRegion(tableName) as TableNode

        const sourceCode = await tableNode?.execute<any[]>(tableNode.dialect.showTableSource(tableNode.database, tableNode.table))
        if (sourceCode) {
            const markdownStr = new vscode.MarkdownString();
            markdownStr.appendCodeblock(sourceCode[0]['Create Table'], "sql");
            return new vscode.Hover(markdownStr);
        }

        return null;
    }

}
