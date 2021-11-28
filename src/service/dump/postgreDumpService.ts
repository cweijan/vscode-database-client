import { Console } from "@/common/Console";
import { Util } from "@/common/util";
import { Node } from "@/model/interface/node";
import { TableNode } from "@/model/main/tableNode";
import { ViewNode } from "@/model/main/viewNode";
import { NodeUtil } from "@/model/nodeUtil";
import { DumpService } from "./dumpService";
import * as vscode from "vscode";
import { platform } from "os";
import { SchemaNode } from "@/model/database/schemaNode";
var commandExistsSync = require('command-exists').sync;

export class PostgreDumpService extends DumpService{

    public async dump(node: Node, withData: boolean) {

        /**
         * https://dev.mysql.com/doc/refman/5.7/en/mysqldump.html
         */
        if (commandExistsSync('pg_dump')) {
            const folderPath = await this.triggerSave(node);
            if (folderPath) {
                NodeUtil.of(node)
                const isTable = node instanceof TableNode || node instanceof ViewNode;
                const host = node.usingSSH ? "127.0.0.1" : node.host
                const port = node.usingSSH ? NodeUtil.getTunnelPort(node.key) : node.port;
                const data = withData ? '' : ' --schema-only';
                const tables = isTable ? ` -t "\\"${node.label}\\""` : '';
                const schema = node instanceof SchemaNode ? ` -n ${node.schema}` : '';

                let command = `pg_dump -h ${host} -w -p ${port} -U ${node.user} ${data} ${schema} ${tables} ${node.database}>${folderPath.fsPath}`;
                if(node.password){
                    let prefix = platform() == 'win32' ? 'set' : 'export';
                    command=`${prefix} "PGPASSWORD=${node.password}" && ` +command
                }
                
                // Console.log(`Executing: ${command}`);
                Util.execute(command).then(() => {
                    vscode.window.showInformationMessage(`Backup ${node.getHost()}_${node.schema} success!`, 'open').then(action => {
                        if (action == 'open') {
                            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(folderPath.fsPath));
                        }
                    })
                }).catch(err => Console.log(err.message))
            }
            return Promise.reject("Dump canceled.");
        }

        return super.dump(node, withData);
    }

}