import { Console } from "@/common/Console";
import { Node } from "@/model/interface/node";
import { NodeUtil } from "@/model/nodeUtil";
import { exec } from "child_process";
import { ImportService } from "./importService";
var commandExistsSync = require('command-exists').sync;

export class PostgresqlImortService extends ImportService {
    public importSql(importPath: string, node: Node): void {

        if (commandExistsSync('pg_restore')) {
            NodeUtil.of(node)
            const host = node.usingSSH ? "127.0.0.1" : node.host
            const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;
            const command = `SET "PGPASSWORD=${node.password}" && pg_restore -h ${host} -p ${port} -U ${node.user} -d ${node.database} ${importPath}`
            Console.log(` Executing: \`${command}`);
            exec(command, err => {
                if (err) {
                    Console.log(err);
                } else {
                    Console.log(`Import Success!`);
                }
            })
        } else {
            super.importSql(importPath, node)
        }

    }
}