import { Node } from "@/model/interface/node";
import { DumpService } from "./dumpService";
var commandExistsSync = require("command-exists").sync;

export class ClickHouseDumpService extends DumpService {
  public async dump(node: Node, withData: boolean) {
    return super.dump(node, withData);
  }
}
