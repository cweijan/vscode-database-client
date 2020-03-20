import * as vscode from 'vscode';
import { HoverProvider } from "vscode";
import { DatabaseCache } from "../database/DatabaseCache";
import { ColumnNode } from "../model/table/columnNode";


export class TableHoverProvider implements HoverProvider {

    async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover> {

        const tableName = document.getText(document.getWordRangeAtPosition(position));
        for (const tableNode of DatabaseCache.getTableNodeList()) {
            if (tableNode.table == tableName) {
                let columnNodes = (await tableNode.getChildren()) as ColumnNode[]
                let hoverContent=`${tableNode.database}.${tableName}:`;
                for (const columnNode of columnNodes) {
                    hoverContent+=`
${columnNode.column.COLUMN_NAME} ${columnNode.column.COLUMN_TYPE} ${columnNode.column.COLUMN_COMMENT?'comment '+columnNode.column.COLUMN_COMMENT:''} `
                }
                let markdownStr=new vscode.MarkdownString()
                markdownStr.appendCodeblock(hoverContent,'sql')
                return new vscode.Hover(markdownStr)
            }
        }

        return null;
    }

}