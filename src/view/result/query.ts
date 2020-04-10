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

        switch (queryParam.type) {
            case MessageType.DATA:
                await this.loadTableInfo(queryParam)
                break;
            case MessageType.DML:
                queryParam.res.message = `EXECUTE SUCCESS:<br><br>&nbsp;&nbsp;${queryParam.res.sql}<br><br>AffectedRows : ${queryParam.res.affectedRows}, CostTime : ${queryParam.res.costTime}ms`
                break;
            case MessageType.ERROR:
                queryParam.res.message = `EXECUTE FAIL:<br><br>&nbsp;&nbsp;${queryParam.res.sql}<br><br>Message :<br><br>&nbsp;&nbsp;${queryParam.res.message}`
                break;
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
        let info = this.getTable(queryParam.res.sql)
        const tableName = info.table
        const database = info.database
        if (tableName == null || conn == null) return;
        // load table infomation
        let tableNode = DatabaseCache.getTable(`${conn.host}_${conn.port}_${conn.user}_${database ? database : conn.database}`, tableName)
        if (tableNode) {
            let primaryKey: string;
            let columnList = (await tableNode.getChildren()).map((columnNode: ColumnNode) => {
                if (columnNode.column.key === "PRI") {
                    primaryKey = columnNode.column.name
                }
                return columnNode.column
            })
            queryParam.res.primaryKey = primaryKey
            queryParam.res.columnList = columnList
        }
        queryParam.res.table = tableName
        queryParam.res.database = conn.database
    }

    private static getTable(sql: string): TableInfo {
        if (!sql) return null;
        let tableInfo = new TableInfo()
        let baseMatch: string[];
        if (sql && (baseMatch = (sql + " ").match(/select\s+\*\s+from\s*(.+?)(?=[\s;])/i)) && !sql.match(/\bjoin\b/ig)) {
            let expectTable: string = baseMatch[1].replace(/`/g, "");
            let temp: string[] = expectTable.split(".")
            if (temp.length == 2) {
                tableInfo.database = temp[0]
                tableInfo.table = temp[1]
            }
            return tableInfo;
        }
    }

}

class TableInfo {
    public database: string;
    public table: string;
}