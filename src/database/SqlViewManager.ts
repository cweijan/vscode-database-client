import * as fs from "fs";
import * as vscode from "vscode";
import { WebviewPanel } from "vscode";
import { OperateType } from "../common/Constants";
import { Console } from "../common/OutputChannel";
import { IConnection } from "../model/Connection";
import { MySQLTreeDataProvider } from "../provider/MysqlTreeDataProvider";
import { ConnectionManager } from "./ConnectionManager";
import { DatabaseCache } from "./DatabaseCache";
import { ColumnNode } from "../model/table/columnNode";
"use strict";

export class ViewOption {
    viewPath?: string;
    viewTitle?: string;
    splitResultView: boolean = false;
    extra?: any;
    /**
     * receive webview send message 
     */
    receiveListener?: (message: any) => {}

    disposeListener?: (message: any) => {}
}

export class SqlViewManager {

    static extensionPath: string
    static initExtesnsionPath(extensionPath: string) {
        this.extensionPath = extensionPath
    }

    private static resultWebviewPanel: WebviewPanel
    private static sendData: any;
    private static creating = false;
    public static async showQueryResult(viewOption: ViewOption, opt: IConnection) {
        
        let tableName = this.getTable(viewOption.extra)
        // load table infomation
        let tableNode = DatabaseCache.getTable(`${opt.host}_${opt.port}_${opt.user}_${opt.database}`, tableName)
        if (tableNode) {
            let primaryKey: string;
            let columnList = (await tableNode.getChildren()).map((columnNode: ColumnNode) => {
                if (columnNode.column.COLUMN_KEY === "PRI") {
                    primaryKey = columnNode.column.COLUMN_NAME
                }
                return columnNode.column.COLUMN_NAME
            })
            viewOption.extra['primaryKey'] = primaryKey
            viewOption.extra['columnList'] = columnList
            viewOption.extra['database'] = opt.database
            viewOption.extra['table'] = tableName
        }
        this.sendData = viewOption.extra
        if (this.creating) return;
        // update result webview
        if (this.resultWebviewPanel) {
            if (this.resultWebviewPanel.visible) {
                this.resultWebviewPanel.webview.postMessage(viewOption.extra)
                this.resultWebviewPanel.reveal(vscode.ViewColumn.Two, true);
                return;
            } else {
                this.resultWebviewPanel.dispose()
            }

        }

        // init result webview
        viewOption.viewPath = "result"
        viewOption.viewTitle = "Query"
        this.creating = true;
        this.createWebviewPanel(viewOption).then(async webviewPanel => {
            this.resultWebviewPanel = webviewPanel
            this.creating = false;
            webviewPanel.onDidDispose(() => { this.resultWebviewPanel = undefined; this.creating = false; })
            webviewPanel.webview.onDidReceiveMessage((params) => {
                switch (params.type) {
                    case OperateType.init:
                        webviewPanel.webview.postMessage(SqlViewManager.sendData)
                        break;
                    case OperateType.execute:
                        vscode.commands.executeCommand('mysql.runQuery', params.sql)
                        break;
                }
            })
        })


    }

    private static getTable(extra: any): string {
        if (!extra) return null;
        let sql = extra.sql;
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

    static showConnectPage() {

        this.createWebviewPanel({
            viewPath: "connect",
            viewTitle: "connect",
            splitResultView: false
        }).then(webviewPanel => {
            webviewPanel.webview.onDidReceiveMessage((params) => {
                if (params.type === 'CONNECT_TO_SQL_SERVER') {
                    ConnectionManager.getConnection(params.connectionOption).then(() => {
                        MySQLTreeDataProvider.instance.addConnection(params.connectionOption);
                        webviewPanel.dispose();
                    }).catch((err: Error) => {
                        webviewPanel.webview.postMessage({
                            type: 'CONNECTION_ERROR',
                            err
                        });
                    })
                }
            });
        })
    }

    private static createWebviewPanel(viewOption: ViewOption): Promise<WebviewPanel> {

        let columnType = viewOption.splitResultView ? vscode.ViewColumn.Two : vscode.ViewColumn.One

        return new Promise((resolve, reject) => {
            fs.readFile(`${this.extensionPath}/resources/webview/${viewOption.viewPath}.html`, 'utf8', async (err, data) => {
                if (err) {
                    Console.log(err)
                    reject(err)
                    return;
                }
                const webviewPanel = await vscode.window.createWebviewPanel(
                    "mysql.sql.result",
                    viewOption.viewTitle,
                    { viewColumn: columnType, preserveFocus: true },
                    { enableScripts: true, retainContextWhenHidden: true }
                );
                webviewPanel.webview.html = data.replace(/\$\{webviewPath\}/gi,
                    vscode.Uri.file(`${this.extensionPath}/resources/webview`)
                        .with({ scheme: 'vscode-resource' }).toString())
                webviewPanel.webview.onDidReceiveMessage(viewOption.receiveListener);
                webviewPanel.onDidDispose(viewOption.disposeListener)

                resolve(webviewPanel)
            })

        })

    }

}