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
import { ModelType } from "@/common/constants";
import { Util } from "@/common/util";
import mysqldump, { Options } from './mysql/main';

export class DumpService {

    public async dump(node: Node, withData: boolean) {

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
                .filter(item => item.contextValue != ModelType.INFO && item.contextValue != ModelType.SYSTEM_VIEW_GROUP)
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

    protected dumpData(node: Node, dumpFilePath: string, withData: boolean, items: vscode.QuickPickItem[]): void {

        const tables = items.filter(item => item.description == ModelType.TABLE).map(item => item.label)
        const viewList = items.filter(item => item.description == ModelType.VIEW).map(item => item.label)
        const procedureList = items.filter(item => item.description == ModelType.PROCEDURE).map(item => item.label)
        const functionList = items.filter(item => item.description == ModelType.FUNCTION).map(item => item.label)
        const triggerList = items.filter(item => item.description == ModelType.TRIGGER).map(item => item.label)

        const option: Options = {
            dump: {
                withDatabase: items.length != 1,
                tables, viewList, procedureList, functionList, triggerList
            },
            dumpToFile: dumpFilePath,
        };
        if (!withData) {
            option.dump.data = false;
        }
        Util.process(`Doing backup ${node.host}_${node.database}...`, (done) => {
            mysqldump(option, node).then(() => {
                vscode.window.showInformationMessage(`Backup ${node.getHost()}_${node.database} success!`, 'open').then(action => {
                    if (action == 'open') {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(dumpFilePath));
                    }
                })
            }).finally(done)
        })

    }


}
