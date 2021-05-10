import { Util } from "@/common/util";
import { readFileSync } from "fs";
import { window } from "vscode";
import { Node } from "../../model/interface/node";
import { ConnectionManager } from "../connectionManager";

export abstract class ImportService {

    public importSql(importPath: string, node: Node): void {

        const sql=readFileSync(importPath,'utf8')
        Util.process(`Importing sql file ${importPath}`,async done=>{
            try {
                const importSessionId = `import_${new Date().getTime()}`;
                await node.execute(sql,importSessionId)
                ConnectionManager.removeConnection(importSessionId)
                window.showInformationMessage(`Import sql file ${importPath} success!`)
            }finally{
                done()
            }
        })

    }

}