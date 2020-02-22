import { WebviewPanel } from "vscode";
"use strict";
import * as fs from "fs";
import * as vscode from "vscode";
import { Console } from "../common/OutputChannel";
import { ConnectionManager } from "./ConnectionManager";
import { MySQLTreeDataProvider } from "../provider/MysqlTreeDataProvider";

export class ViewOption {
    viewPath?: string;
    viewTitle?: string;
    sql?: string;
    data?: any;
    splitResultView: boolean = false;
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
    public static initExtesnsionPath(extensionPath: string) {
        this.extensionPath = extensionPath
    }

    public static showQueryResult(viewOption: ViewOption) {

        if (this.resultWebviewPanel) {
            //TODO 这里需要根据splitResultView对窗口进行调整
            this.resultWebviewPanel.webview.postMessage(viewOption)
            this.resultWebviewPanel.reveal(vscode.ViewColumn.Two, true);
            return;
        }

        viewOption.viewPath = "result"
        viewOption.viewTitle = "result"

        this.createWebviewPanel(viewOption).then(webviewPanel => {
            this.resultWebviewPanel = webviewPanel
            webviewPanel.webview.postMessage(viewOption)
            webviewPanel.onDidDispose(() => { this.resultWebviewPanel = undefined })

            // vscode.commands.executeCommand('setContext', "httpResponsePreviewFocus", true);
        })


    }

    public static showConnectPage(mysqlTreeDataProvider: MySQLTreeDataProvider) {

        this.createWebviewPanel({
            viewPath: "connect",
            viewTitle: "connect",
            splitResultView: false
        }).then(webviewPanel => {
            webviewPanel.webview.onDidReceiveMessage((params) => {
                if (params.type === 'CONNECT_TO_SQL_SERVER') {
                    ConnectionManager.getConnection(params.connectionOption).then(() => {
                        mysqlTreeDataProvider.addConnection(params.connectionOption);
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
                    columnType,
                    { enableScripts: true }
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