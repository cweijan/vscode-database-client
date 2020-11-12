import mysqldump, { Options } from 'mysqldump_plus';
import * as vscode from "vscode";
import { Console } from "../../common/Console";
import { Node } from "../../model/interface/node";
import { NodeUtil } from "../../model/nodeUtil";
import { AbstractDumpService } from "./abstractDumpService";

export class MysqlDumpService extends AbstractDumpService {
    protected dumpData(node: Node, dumpFilePath: string, withData: boolean,tables:string[]): void {

        const host = node.usingSSH ? "127.0.0.1" : node.host
        const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;

        Console.log(`Doing backup ${host}_${node.database}...
Origin command : \`mysqldump -h ${host} -P ${port} -u ${node.user} -p --database ${node.database} > ${dumpFilePath}\`.`);

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
        mysqldump(option).then(() => {
            vscode.window.showInformationMessage(`Backup ${node.getHost()}_${node.database} success!`);
        }).catch((err) => {
            vscode.window.showErrorMessage(`Backup ${node.getHost()}_${node.database} fail!\n${err}`);
        }).then(() => {
            Console.log(`backup end.`);
        })
    }

}