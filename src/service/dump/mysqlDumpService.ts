import mysqldump, { Options } from 'mysqldump';
import * as vscode from "vscode";
import { Console } from "../../common/outputChannel";
import { Node } from "../../model/interface/node";
import { TableNode } from "../../model/main/tableNode";
import { NodeUtil } from "../../model/nodeUtil";
import { AbstractDumpService } from "./abstractDumpService";
import format = require('date-format');
import path = require('path');

export class MysqlDumpService extends AbstractDumpService {
    protected dumpData(node: Node, exportPath: string, withData: boolean): void {
        Console.log(`Doing backup ${node.host}_${node.database}...`);
        const tableName = node instanceof TableNode ? (node as TableNode).table : null;
        const option: Options = {
            connection: {
                host: node.host,
                user: node.user,
                password: node.password,
                database: node.database,
                port: node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port,
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
            dumpToFile: path.join(exportPath, `${node.database}${tableName ? "_" + tableName : ''}_${format('yyyy-MM-dd_hhmmss', new Date())}.sql`),
        };
        if (!withData) {
            option.dump.data = false;
        }
        mysqldump(option).then(() => {
            vscode.window.showInformationMessage(`Backup ${node.getHost()}_${node.database} success!`);
        }).catch((err) => {
            vscode.window.showErrorMessage(`Backup ${node.getHost()}_${node.database} fail!\n${err}`);
        }).then(() => {
            Console.log("backup end.");
        })
    }

}