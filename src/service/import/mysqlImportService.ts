import { Node } from "../../model/interface/node";
import { exec } from "child_process";
import { Console } from "../../common/outputChannel";
import { NodeUtil } from "../../model/nodeUtil";
import { ImportService } from "./importService";
import { DatabaseCache } from "../common/databaseCache";


export class MysqlImportService implements ImportService {

    public import(importPath: string, node: Node): void {

        NodeUtil.of(node)
        node = DatabaseCache.getDatabase(node.getConnectId(),node.database)

        const host = node.usingSSH ? "127.0.0.1" : node.host
        const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;
        const command = `mysql -h ${host} -P ${port} -u ${node.user} ${node.password ? `-p${node.password}` : ""} ${node.database} < ${importPath}`
        Console.log(`
        Ensure you has been install mysql.\n
        Executing: \`${command.replace(/-p.+? /, "-p****** ")}\``);
        exec(command, err => {
            if (err) {
                Console.log(err);
            } else {
                Console.log(`Import Success!`);
            }
        })
    }

}