import * as vscode from "vscode";
import mysqldump, { Options } from 'mysqldump';
import { AbstractDumpService } from "./abstractDumpService";
import format = require('date-format');
import { Node } from "../../model/interface/node";
import { Console } from "../../common/outputChannel";
import { TableNode } from "../../model/main/tableNode";

export class MysqlDumpService extends AbstractDumpService {
    protected dumpData(node: Node, exportPath: string, withData: boolean): void {
        Console.log(`Doing backup ${node.host}_${node.database}...`);
        const tableName = node instanceof TableNode ? (node as TableNode).table : null;
        const option: Options = {
            connection: {
                host: node.usingSSH ? node.origin.host : node.host,
                user: node.usingSSH ? node.origin.user : node.user,
                password: node.usingSSH ? node.origin.password : node.password,
                database: node.database,
                port: node.usingSSH ? node.ssh.tunnelPort : parseInt(node.port),
            },
            dump: {
                tables: tableName ? [tableName] : [],
                schema: {
                    format: false,
                    table: {
                        ifNotExist: false,
                        dropIfExist: true,
                        charset: true,
                    }
                },
            },
            dumpToFile: `${exportPath}\\${node.database}${tableName ? "_" + tableName : ''}_${format('yyyy-MM-dd_hhmmss', new Date())}.sql`,
        };
        if (!withData) {
            option.dump.data = false;
        }
        mysqldump(option).then(() => {
            vscode.window.showInformationMessage(`Backup ${node.host}_${node.database} success!`);
        }).catch((err) => {
            vscode.window.showErrorMessage(`Backup ${node.host}_${node.database} fail!\n${err}`);
        }).then(() => {
            Console.log("backup end.");
        })
    }

}