import { Console } from "@/common/Console";
import { Util } from "@/common/util";
import { Node } from "@/model/interface/node";
import { NodeUtil } from "@/model/nodeUtil";
import { DumpService } from "./dumpService";
import { Options } from "./mysql/main";
var commandExistsSync = require('command-exists').sync;

export class MysqlDumpService extends DumpService {

    protected processDump(option: Options, node: Node): Promise<void> {

        if (commandExistsSync('mysqldump')) {
            NodeUtil.of(node)
            const host = node.usingSSH ? "127.0.0.1" : node.host
            const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;
            const command = `mysqldump -h ${host} -P ${port} -u ${node.user} -p${node.password} ${node.schema}>${option.dumpToFile}`
            Console.log(`Executing: ${command}`);
            return Util.execute(command)
        }

        return super.processDump(option, node);
    }

}