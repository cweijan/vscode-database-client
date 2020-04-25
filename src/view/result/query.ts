import * as vscode from "vscode";
import { WebviewPanel } from "vscode";
import { MessageType, OperateType } from "../../common/Constants";
import { SqlViewManager } from "../SqlViewManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { ColumnNode } from "../../model/other/columnNode";
import { DataResponse } from "./queryResponse";
import { Node } from "../../model/interface/node";

export class QueryParam<T> {
    public type: MessageType;
    /**
     * using in loadColumnList
     */
    public connection?: Node;
    public res: T;
}

export class QueryPage {
    private static resultWebviewPanel: WebviewPanel;
    /**
     * ensure send newest message.
     */
    private static sendData: any;
    private static creating = false;
    public static async send(queryParam: QueryParam<any>) {

        switch (queryParam.type) {
            case MessageType.DATA:
                await this.loadColumnList(queryParam);
                break;
            case MessageType.DML:
            case MessageType.DDL:
                queryParam.res.message = `EXECUTE SUCCESS:<br><br>&nbsp;&nbsp;${queryParam.res.sql}<br><br>AffectedRows : ${queryParam.res.affectedRows}, CostTime : ${queryParam.res.costTime}ms`;
                break;
            case MessageType.ERROR:
                queryParam.res.message = `EXECUTE FAIL:<br><br>&nbsp;&nbsp;${queryParam.res.sql}<br><br>Message :<br><br>&nbsp;&nbsp;${queryParam.res.message}`;
                break;
        }

        this.sendData = queryParam;
        if (this.creating) { return; }

        // update result webview
        if (this.resultWebviewPanel) {
            if (this.resultWebviewPanel.visible) {
                this.resultWebviewPanel.webview.postMessage(QueryPage.sendData);
                this.resultWebviewPanel.reveal(vscode.ViewColumn.Two, true);
                return;
            } else {
                this.resultWebviewPanel.dispose();
            }
        }

        // init result webview
        this.creating = true;
        SqlViewManager.createWebviewPanel({
            splitResultView: true, viewPath: "pages/result/index", viewTitle: "Query",
        }).then(async (webviewPanel) => {
            this.resultWebviewPanel = webviewPanel;
            this.creating = false;
            webviewPanel.onDidDispose(() => { this.resultWebviewPanel = undefined; this.creating = false; });
            webviewPanel.webview.onDidReceiveMessage((params) => {
                switch (params.type) {
                    case OperateType.init:
                        webviewPanel.webview.postMessage(QueryPage.sendData);
                        break;
                    case OperateType.execute:
                        QueryUnit.runQuery(params.sql);
                        break;
                }
            });
        });

    }

    private static async loadColumnList(queryParam: QueryParam<DataResponse>) {
        const fields = queryParam.res.fields;
        const conn = queryParam.connection;
        if (!fields || fields.length == 0) { return; }
        const tableName = fields[0].orgTable;
        const database = fields[0].db;
        if (tableName == null || conn == null) { return; }
        // load table infomation
        const tableNode = DatabaseCache.getTable(`${conn.host}_${conn.port}_${conn.user}_${database ? database : conn.database}`, tableName);
        if (tableNode) {
            let primaryKey: string;
            const columnList = (await tableNode.getChildren()).map((columnNode: ColumnNode) => {
                if (columnNode.column.key === "PRI") {
                    primaryKey = columnNode.column.name;
                }
                return columnNode.column;
            });
            queryParam.res.primaryKey = primaryKey;
            queryParam.res.columnList = columnList;
        }
        queryParam.res.table = tableName;
        queryParam.res.database = conn.database;
        queryParam.connection = null;
    }

}

class TableInfo {
    public database: string;
    public table: string;
}