import { Console } from "@/common/Console";
import { Util } from "@/common/util";
import { readFileSync } from "fs";
import { window } from "vscode";
import { Node } from "../../model/interface/node";

export abstract class ImportService {

    public importSql(importPath: string, node: Node): void {

        const sql=readFileSync(importPath,'utf8')
        Util.process(`Importing sql file ${importPath}`,async done=>{
            try {
                await node.execute(sql)
                window.showInformationMessage(`Importing sql file ${importPath} success!`)
            }finally{
                done()
            }
        })

    }

}