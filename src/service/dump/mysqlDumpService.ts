import { ModelType } from '@/common/constants';
import { Util } from '@/common/util';
import * as vscode from "vscode";
import { QuickPickItem } from 'vscode';
import { Node } from "../../model/interface/node";
import { NodeUtil } from "../../model/nodeUtil";
import { AbstractDumpService } from "./abstractDumpService";
import mysqldump, { Options } from './mysql/main';

export class MysqlDumpService extends AbstractDumpService {
    protected dumpData(node: Node, dumpFilePath: string, withData: boolean, items: QuickPickItem[]): void {

        const host = node.usingSSH ? "127.0.0.1" : node.host
        const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;

        const tables = items.filter(item => item.description == ModelType.TABLE).map(item => item.label)

        const option: Options = {
            connection: {
                host: host,
                user: node.user,
                password: node.password,
                database: node.database,
                port: port,
            },
            dump: {
                withDatabase: items.length != 1,
                tables
            },
            dumpToFile: dumpFilePath,
        };
        if (!withData) {
            option.dump.data = false;
        } 
        Util.process(`Doing backup ${host}_${node.database}...`, (done) => {
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