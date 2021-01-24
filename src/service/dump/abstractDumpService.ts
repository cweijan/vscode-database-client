import { DatabaseType, ModelType } from "@/common/constants";
import { ViewNode } from "@/model/main/viewNode";
import * as vscode from "vscode";
import { Node } from "../../model/interface/node";
import { TableNode } from "../../model/main/tableNode";
import { DatabaseCache } from "../common/databaseCache";
import format = require('date-format');
import path = require('path');
import { TableGroup } from "@/model/main/tableGroup";
import { ViewGroup } from "@/model/main/viewGroup";

export abstract class AbstractDumpService {

    public async dump(node: Node, withData: boolean) {

        const dbType = node.dbType
        if (dbType == DatabaseType.MSSQL || dbType == DatabaseType.PG) {
            vscode.window.showErrorMessage("Dump only support mysql.")
            return;
        }

        let tables = []
        if (node instanceof TableNode || node instanceof ViewNode) {
            tables = [node.table]
        } else {
            const tableList = await new TableGroup(node).getChildren();
            const viewList = await new ViewGroup(node).getChildren();
            const tableAndViewList = tableList.concat(viewList)
            tables = await vscode.window.showQuickPick(tableAndViewList.map(table => table.label), { canPickMany: true, placeHolder: "Select databases to export, default is all" })
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
