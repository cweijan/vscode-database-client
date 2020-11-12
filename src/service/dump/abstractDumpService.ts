import { Node } from "../../model/interface/node";
import * as vscode from "vscode";
import { DatabaseCache } from "../common/databaseCache";
import { Console } from "../../common/Console";
import { DatabaseNode } from "../../model/database/databaseNode";
import format = require('date-format');
import path = require('path');
import { TableNode } from "../../model/main/tableNode";

export abstract class AbstractDumpService {

    public async dump(node: Node, withData: boolean) {

        const tableList = DatabaseCache.getTableListOfDatabase(node.id);

        let tables = []
        if (node instanceof TableNode) {
            tables = [node.table]
        } else {
            tables = await vscode.window.showQuickPick(tableList.map(table => table.label), { canPickMany: true, placeHolder: "Select databases to export, default is all" })
            if (!tables) {
                return;
            }
        }

        const tableName = node instanceof TableNode ? node.table : null;
        const exportSqlName = `${tableName ? tableName : ''}_${format('yyyy-MM-dd_hhmmss', new Date())}_${node.database}.sql`;

        vscode.window.showSaveDialog({ saveLabel: "Select export file path", defaultUri: vscode.Uri.file(exportSqlName), filters: { 'sql': ['sql'] } }).then((folderPath) => {
            if (folderPath) {
                this.dumpData(node, folderPath.fsPath, withData, tables)
            }
        })

    }

    protected abstract dumpData(node: Node, exportPath: string, withData: boolean, tables: string[]): void;

}