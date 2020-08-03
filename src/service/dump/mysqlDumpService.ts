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

        const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;
        const tableName = node instanceof TableNode ? node.table : null;
        const dumpFilePath = path.join(exportPath, `${node.database}${tableName ? "_" + tableName : ''}_${format('yyyy-MM-dd_hhmmss', new Date())}.sql`);

        Console.log(`${format('yyyy-MM-dd hh:mm:ss', new Date())} : Doing backup ${node.host}_${node.database}...`);
        Console.log(`You can run command \`mysqldump -h ${node.host} -P ${port} -u ${node.user} -p --database ${node.database} > ${dumpFilePath}\` to speed up dump.`);

        const option: Options = {
            connection: {
                host: node.host,
                user: node.user,
                password: node.password,
                database: node.database,
                port: port,
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
            dumpToFile: dumpFilePath,
        };
        if (!withData) {
            option.dump.data = false;
        } else {
            option.dump.data = {
                format: false,
                maxRowsPerInsertStatement:5000
            }
        }
        mysqldump(option).then(() => {
            vscode.window.showInformationMessage(`Backup ${node.getHost()}_${node.database} success!`);
        }).catch((err) => {
            vscode.window.showErrorMessage(`Backup ${node.getHost()}_${node.database} fail!\n${err}`);
        }).then(() => {
            Console.log(`${format('yyyy-MM-dd hh:mm:ss', new Date())} : backup end.`);
        })
    }

}