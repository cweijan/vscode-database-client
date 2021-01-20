import { FileManager, FileModel } from "@/common/filesManager";
import { ConnectionManager } from "@/service/connectionManager";
import { QueryUnit } from "@/service/queryUnit";
import * as vscode from 'vscode';
import { EsBaseNode } from "./model/esBaseNode";
import { ElasticMatch } from "./provider/ElasticMatch";

export class EsUtil {

    public static async executeEsQueryFile(em: ElasticMatch, parse: boolean) {
        const node = ConnectionManager.getByActiveFile() as EsBaseNode;
        if (node == null) {
            vscode.window.showErrorMessage("Not active es found!")
            return;
        }
        if(parse){
            QueryUnit.runQuery(`${em.Method.Text} ${em.Path.Text}\n${em.Body.Text}`,node)
            return;
        }
        (await node.getConnection()).query(`${em.Method.Text} ${em.Path.Text}\n${em.Body.Text}`, 'dontParse', async (err, data) => {
            vscode.window.showTextDocument(
                await vscode.workspace.openTextDocument(await FileManager.record(`${node.getConnectId()}#result.json`, JSON.stringify(data, null, 2), FileModel.WRITE)),
                vscode.ViewColumn.Two, true
            )
        })
    }

}