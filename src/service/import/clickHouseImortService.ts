import { Console } from "@/common/Console";
import { Node } from "@/model/interface/node";
import { NodeUtil } from "@/model/nodeUtil";
import { exec } from "child_process";
import { platform } from "os";
import { ImportService } from "./importService";
var commandExistsSync = require("command-exists").sync;

export class ClickHouseImortService extends ImportService {
  public importSql(importPath: string, node: Node): void {
    super.importSql(importPath, node);
  }
}
