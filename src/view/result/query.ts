import * as vscode from "vscode";
import { WebviewPanel } from "vscode";
import { MessageType, OperateType } from "../../common/Constants";
import { SqlViewManager } from "../../common/SqlViewManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { IConnection } from "../../model/Connection";
import { ColumnNode } from "../../model/table/columnNode";
import { DataResponse } from "./queryResponse";

export class QueryParam<T> {
    type: MessageType;
    connection?: IConnection;
    res: T;
}

export class QueryPage {
    private static resultWebviewPanel: WebviewPanel
    /**
     * ensure send newest message.
     */
    private static sendData: any;
    private static creating = false;
    public static async send(queryParam: QueryParam<any>) {
        if(queryParam.type==MessageType.DATA){
            await this.loadTableInfo(queryParam)
        }
        this.sendData = queryParam
        if (this.creating) return;

        // update result webview
        if (this.resultWebviewPanel) {
            if (this.resultWebviewPanel.visible) {
                this.resultWebviewPanel.webview.postMessage(QueryPage.sendData)
                this.resultWebviewPanel.reveal(vscode.ViewColumn.Two, true);
                return;
            } else {
                this.resultWebviewPanel.dispose()
            }
        }

        // init result webview
        this.creating = true;
        SqlViewManager.createWebviewPanel({
            splitResultView: true, viewPath: "result", viewTitle: "Query"
        }).then(async webviewPanel => {
            this.resultWebviewPanel = webviewPanel
            this.creating = false;
            webviewPanel.onDidDispose(() => { this.resultWebviewPanel = undefined; this.creating = false; })
            webviewPanel.webview.onDidReceiveMessage((params) => {
                switch (params.type) {
                    case OperateType.init:
                        webviewPanel.webview.postMessage(QueryPage.sendData)
                        break;
                    case OperateType.execute:
                        QueryUnit.runQuery(params.sql)
                        break;
                }
            })
        })

    }
    private static async loadTableInfo(queryParam: QueryParam<DataResponse>) {
        let conn = queryParam.connection
        let tableName = this.getTable(queryParam.res.sql)
        if (tableName == null || conn == null) return;
        // load table infomation
        let tableNode = DatabaseCache.getTable(`${conn.host}_${conn.port}_${conn.user}_${conn.database}`, tableName)
        if (tableNode) {
            let primaryKey: string;
            let columnList = (await tableNode.getChildren()).map((columnNode: ColumnNode) => {
                if (columnNode.column.COLUMN_KEY === "PRI") {
                    primaryKey = columnNode.column.COLUMN_NAME
                }
                return columnNode.column.COLUMN_NAME
            })
            queryParam.res.primaryKey = primaryKey
            queryParam.res.columnList = columnList
            queryParam.res.database = conn.database
            queryParam.res.table = tableName
        }
    }

    private static getTable(sql: string): string {
        if (!sql) return null;
        let baseMatch;
        if (sql && (baseMatch = (sql + " ").match(/select\s+\*\s+from\s*(.+?)(?=[\s;])/i)) && !sql.match(/\bjoin\b/ig)) {
            let expectTable: string = baseMatch[1];
            let temp: string[], table;
            if (expectTable.includes("`")) {
                temp = expectTable.split("`");
                table = temp[temp.length - 2];
            } else {
                temp = expectTable.split(".")
                table = temp[temp.length - 1]
            }
            return table;
        }
    }

}