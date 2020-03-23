import * as fs from "fs";
import * as vscode from "vscode";
import { WebviewPanel } from "vscode";
import { OperateType } from "../common/Constants";
import { Console } from "../common/OutputChannel";
import { IConnection } from "../model/Connection";
import { MySQLTreeDataProvider } from "../provider/MysqlTreeDataProvider";
import { ConnectionManager } from "./ConnectionManager";
import { DatabaseCache } from "./DatabaseCache";
import { QueryUnit } from "./QueryUnit";
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
    static resultWebviewPanel: WebviewPanel
    static tableEditWebviewPanel: WebviewPanel
    static tableCreateWebviewPanel: WebviewPanel
    static extensionPath: string
    static initExtesnsionPath(extensionPath: string) {
        this.extensionPath = extensionPath
    }


    static async showQueryResult(viewOption: ViewOption, opt: IConnection) {

        let tableName = this.getTable(viewOption.extra)
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
        if (this.resultWebviewPanel) {
            if (this.resultWebviewPanel.visible) {
                this.resultWebviewPanel.webview.postMessage(viewOption.extra)
                this.resultWebviewPanel.reveal(vscode.ViewColumn.Two, true);
                return;
            } else {
                this.resultWebviewPanel.dispose()
            }

        }

        viewOption.viewPath = "result"
        viewOption.viewTitle = "Query"

        this.createWebviewPanel(viewOption).then(webviewPanel => {
            this.resultWebviewPanel = webviewPanel
            webviewPanel.webview.postMessage(viewOption.extra)
            webviewPanel.onDidDispose(() => { this.resultWebviewPanel = undefined })
            webviewPanel.webview.onDidReceiveMessage((params) => {
                if (params.type == OperateType.execute) {
                    QueryUnit.runQuery(params.sql)
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