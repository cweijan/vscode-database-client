import { Console } from "@/common/Console";
import { Node } from "@/model/interface/node";
import { NodeUtil } from "@/model/nodeUtil";
import { exec } from "child_process";
import { platform } from "os";
import { ImportService } from "./importService";
var commandExistsSync = require('command-exists').sync;

export class PostgresqlImortService extends ImportService {
    public importSql(importPath: string, node: Node): void {

        if (commandExistsSync('psql')) {
            NodeUtil.of(node)
            const host = node.usingSSH ? "127.0.0.1" : node.host
            const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;
            const command = `psql -h ${host} -p ${port} -U ${node.user} -d ${node.database} < ${importPath}`
            Console.log(`Executing: ${command}`);
            let prefix = platform() == 'win32' ? 'set' : 'export';
            exec(`${prefix} "PGPASSWORD=${node.password}" && ${command}`, (err,stdout,stderr) => {
                if (err) {
                    Console.log(err);
                }else if(stderr){
                    Console.log(stderr);
                } else {
                    Console.log(`Import Success!`);
                }
            })
        } else {
            super.importSql(importPath, node)
        }

    }
}