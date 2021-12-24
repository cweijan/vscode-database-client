import { Console } from "@/common/Console";
import { Util } from "@/common/util";
import { readFileSync } from "fs";
import { Uri, window } from "vscode";
import { Node } from "../../model/interface/node";
import { DelimiterHolder } from "../common/delimiterHolder";
import { ConnectionManager } from "../connectionManager";

export abstract class ImportService {

    public batchImportSql(sqlUriList: Uri[], node: Node): void {
        if(!sqlUriList){
            return;
        }
        for (const uri of sqlUriList) {
            try {
                this.importSql(uri.fsPath,node)            
            } catch (error) {
                Console.log(error)
            }
        }
    }

    public importSql(importPath: string, node: Node): void {

        let sql = readFileSync(importPath, 'utf8')
        const parseResult = DelimiterHolder.parseBatch(sql, node.getConnectId())
        sql = parseResult.sql
        Util.process(`Importing sql file ${importPath}`, async done => {
            try {
                const importSessionId = `import_${new Date().getTime()}`;
                await node.execute(sql, importSessionId)
                ConnectionManager.removeConnection(importSessionId)
                window.showInformationMessage(`Import sql file ${importPath} success!`)
            } finally {
                done()
            }
        })

    }

    public filter():any {
        return { Sql: ['sql'] };
    }

}