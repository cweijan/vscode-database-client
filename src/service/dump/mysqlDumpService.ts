import mysqldump, { Options } from './mysql/main';
import * as vscode from "vscode";
import { Console } from "../../common/Console";
import { Node } from "../../model/interface/node";
import { NodeUtil } from "../../model/nodeUtil";
import { AbstractDumpService } from "./abstractDumpService";
import { Util } from '@/common/util';

export class MysqlDumpService extends AbstractDumpService {
    protected dumpData(node: Node, dumpFilePath: string, withData: boolean, tables: string[]): void {

        const host = node.usingSSH ? "127.0.0.1" : node.host
        const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;

        const option: Options = {
            connection: {
                host: host,
                user: node.user,
                password: node.password,
                database: node.database,
                port: port,
            },
            dump: {
                withDatabase: true,
                tables,
                schema: {
                    format: false,
                    table: {
                        ifNotExist: false,
                        dropIfExist: true,
                        charset: true,
                    }
                },
            },
            dumpToFile: dumpFilePath,
        };
        if (!withData) {
            option.dump.data = false;
        } else {
            option.dump.data = {
                format: false,
                maxRowsPerInsertStatement: 5000
            }
        }
        Util.process(`Doing backup ${host}_${node.database}...`, (done) => {
            mysqldump(option).then(() => {
                vscode.window.showInformationMessage(`Backup ${node.getHost()}_${node.database} success!`, 'open').then(action => {
                    if (action == 'open') {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(dumpFilePath));
                    }
                })
            }).finally(done)
        })

    }

}