import { DatabaseType } from "@/common/constants";
import { TableGroup } from "@/model/main/tableGroup";
import { ViewGroup } from "@/model/main/viewGroup";
import { ViewNode } from "@/model/main/viewNode";
import * as vscode from "vscode";
import { Node } from "../../model/interface/node";
import { TableNode } from "../../model/main/tableNode";
import format = require('date-format');
import { FunctionGroup } from "@/model/main/functionGroup";
import { ProcedureGroup } from "@/model/main/procedureGroup";
import { TriggerGroup } from "@/model/main/triggerGroup";

export abstract class AbstractDumpService {

    public async dump(node: Node, withData: boolean) {

        const dbType = node.dbType
        if (dbType == DatabaseType.MSSQL || dbType == DatabaseType.PG) {
            vscode.window.showErrorMessage("Dump only support mysql right now!")
            return;
        }

        let nodes = []
        if (node instanceof TableNode || node instanceof ViewNode) {
            nodes = [{ label: node.table, description: node.contextValue }]
        } else {
            const tableList = await new TableGroup(node).getChildren();
            const viewList = await new ViewGroup(node).getChildren();
            const procedureList = await new ProcedureGroup(node).getChildren();
            const functionList = await new FunctionGroup(node).getChildren();
            const triggerList = await new TriggerGroup(node).getChildren();
            const childrenList = [...tableList, ...viewList, ...procedureList, ...functionList, ...triggerList]
            const pickItems = childrenList.map(node => { return { label: node.label, description: node.contextValue, picked: true }; });
            nodes = await vscode.window.showQuickPick(pickItems, { canPickMany: true, matchOnDescription: true, ignoreFocusOut: true })
            if (!nodes) {
                return;
            }
        }

        const tableName = node instanceof TableNode ? node.table : null;
        const exportSqlName = `${tableName ? tableName : ''}_${format('yyyy-MM-dd_hhmmss', new Date())}_${node.database}.sql`;

        vscode.window.showSaveDialog({ saveLabel: "Select export file path", defaultUri: vscode.Uri.file(exportSqlName), filters: { 'sql': ['sql'] } }).then((folderPath) => {
            if (folderPath) {
                this.dumpData(node, folderPath.fsPath, withData, nodes)
            }
        })

    }

    protected abstract dumpData(node: Node, exportPath: string, withData: boolean, tables: vscode.QuickPickItem[]): void;

}
