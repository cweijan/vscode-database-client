import { WebviewPanel } from "vscode";
"use strict";
import * as fs from "fs";
import * as vscode from "vscode";
import { Console } from "../common/OutputChannel";
import { ConnectionManager } from "./ConnectionManager";
import { MySQLTreeDataProvider } from "../provider/MysqlTreeDataProvider";

export class ViewOption {
    viewPath: string;
    viewTitle: string;
    viewId: string;
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


    public static showQueryResult(data: any, title: string) {

        if (this.resultWebviewPanel) {
            this.resultWebviewPanel.webview.postMessage({ data })
            return;
        }

        this.createWebviewPanel({
            viewId: "cweijan.mysql.queryResult",
            viewPath: "result",
            viewTitle: title
        }).then(webviewPanel => {
            this.resultWebviewPanel = webviewPanel
            webviewPanel.webview.postMessage({ data })
            webviewPanel.onDidDispose(() => { this.resultWebviewPanel = undefined })
        })
    }

    public static showConnectPage(mysqlTreeDataProvider: MySQLTreeDataProvider) {

        this.createWebviewPanel({
            viewId: "cweijan.mysql.connect",
            viewPath: "connect",
            viewTitle: "connect"
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

        return new Promise((resolve, reject) => {
            fs.readFile(`${this.extensionPath}/resources/webview/${viewOption.viewPath}.html`, 'utf8', async (err, data) => {
                if (err) {
                    Console.log(err)
                    reject(err)
                    return;
                }
                const webviewPanel = await vscode.window.createWebviewPanel(
                    viewOption.viewId,
                    viewOption.viewTitle,
                    vscode.ViewColumn.One,
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