import * as vscode from "vscode";
import {HoverProvider} from "vscode";
import {DatabaseCache} from "../service/common/databaseCache";
import {ColumnNode} from "../model/other/columnNode";

export class TableHoverProvider implements HoverProvider {

    public async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover> {

        const tableName = document.getText(document.getWordRangeAtPosition(position));
        for (const tableNode of DatabaseCache.getTableNodeList()) {
            if (tableNode.table === tableName) {
                const columnNodes = (await tableNode.getChildren()) as ColumnNode[];
                let hoverContent = `${tableNode.database}.${tableName}:`;
                for (const columnNode of columnNodes) {
                    hoverContent += `
${columnNode.column.name} ${columnNode.column.type} ${columnNode.column.comment ? "comment " + columnNode.column.comment : ""} `;
                }
                const markdownStr = new vscode.MarkdownString();
                markdownStr.appendCodeblock(hoverContent, "sql");
                return new vscode.Hover(markdownStr);
            }
        }

        return null;
    }

}
