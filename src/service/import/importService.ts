import { Console } from "@/common/Console";
import { Util } from "@/common/util";
import { readdirSync, readFileSync, statSync } from "fs";
import { extname, join } from "path";
import { Uri, window } from "vscode";
import { Node } from "../../model/interface/node";
import { DelimiterHolder } from "../common/delimiterHolder";
import { ConnectionManager } from "../connectionManager";

export abstract class ImportService {

    public batchImportSql(sqlPathList: string[], node: Node, recursion: boolean = false): void {
        if (!sqlPathList) {
            return;
        }
        for (const path of sqlPathList) {
            try {
                if (statSync(path).isDirectory()) {
                    const childPathList = readdirSync(path).map(childPath => join(path, childPath))
                    this.batchImportSql(childPathList, node, true);
                    continue;
                }
                // recursion only import sql file.
                if (recursion && extname(path).toLowerCase()!='.sql') {
                    continue;
                }
                this.importSql(path, node)
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

    public filter(): any {
        return { Sql: ['sql'] };
    }

}