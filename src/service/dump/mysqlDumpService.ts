import { Console } from "@/common/Console";
import { Util } from "@/common/util";
import { Node } from "@/model/interface/node";
import { NodeUtil } from "@/model/nodeUtil";
import { DumpService } from "./dumpService";
import { Options } from "./mysql/main";
var commandExistsSync = require('command-exists').sync;

export class MysqlDumpService extends DumpService {

    protected processDump(option: Options, node: Node): Promise<void> {

        /**
         * https://dev.mysql.com/doc/refman/5.7/en/mysqldump.html
         */
        if (commandExistsSync('mysqldump')) {
            NodeUtil.of(node)
            const host = node.usingSSH ? "127.0.0.1" : node.host
            const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;
            const data = option.dump.data === false ? ' --no-data' : '';
            const tables=option.dump.tables?.length>0?' --tables '+option.dump.tables.join(" "):'';
            const command = `mysqldump -h ${host} -P ${port} -u ${node.user} -p${node.password}${data}${tables} ${node.schema}>${option.dumpToFile}`
            Console.log(`Executing: ${command}`);
            return Util.execute(command)
        }

        return super.processDump(option, node);
    }

}