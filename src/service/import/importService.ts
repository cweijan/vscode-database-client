import { readFileSync } from "fs";
import { Node } from "../../model/interface/node";
import { QueryUnit } from "../queryUnit";

export abstract class ImportService {

    public importSql(importPath: string, node: Node): void {

        const sql=readFileSync(importPath,'utf8')
        QueryUnit.runQuery(sql,node)

    }

}