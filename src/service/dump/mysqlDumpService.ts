import { ModelType } from '@/common/constants';
import { Util } from '@/common/util';
import * as vscode from "vscode";
import { QuickPickItem } from 'vscode';
import { Node } from "../../model/interface/node";
import { AbstractDumpService } from "./abstractDumpService";
import mysqldump, { Options } from './mysql/main';

export class MysqlDumpService extends AbstractDumpService {
    protected dumpData(node: Node, dumpFilePath: string, withData: boolean, items: QuickPickItem[]): void {

        const tables = items.filter(item => item.description == ModelType.TABLE).map(item => item.label)
        const viewList = items.filter(item => item.description == ModelType.VIEW).map(item => item.label)
        const procedureList = items.filter(item => item.description == ModelType.PROCEDURE).map(item => item.label)
        const functionList = items.filter(item => item.description == ModelType.FUNCTION).map(item => item.label)
        const triggerList = items.filter(item => item.description == ModelType.TRIGGER).map(item => item.label)

        const option: Options = {
            dump: {
                withDatabase: items.length != 1,
                tables,viewList,procedureList,functionList,triggerList
            },
            dumpToFile: dumpFilePath,
        };
        if (!withData) {
            option.dump.data = false;
        } 
        Util.process(`Doing backup ${node.host}_${node.database}...`, (done) => {
            mysqldump(option,node).then(() => {
                vscode.window.showInformationMessage(`Backup ${node.getHost()}_${node.database} success!`, 'open').then(action => {
                    if (action == 'open') {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(dumpFilePath));
                    }
                })
            }).finally(done)
        })

    }

}