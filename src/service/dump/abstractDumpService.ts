import { Node } from "../../model/interface/node";
import * as vscode from "vscode";
import { DatabaseCache } from "../common/databaseCache";
import { Console } from "../../common/outputChannel";
import { DatabaseNode } from "../../model/database/databaseNode";
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

        vscode.window.showOpenDialog({ canSelectMany: false, openLabel: "Select export file path", canSelectFiles: false, canSelectFolders: true }).then((folderPath) => {
            if (folderPath) {
                this.dumpData(node, folderPath[0].fsPath, withData, tables)
            }
        });

    }

    protected abstract dumpData(node: Node, exportPath: string, withData: boolean, tables: string[]): void;

}