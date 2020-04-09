import * as fs from "fs";
import * as vscode from "vscode";
import { WebviewPanel } from "vscode";
import { ConnectionManager } from "../database/ConnectionManager";
import { MySQLTreeDataProvider } from "../provider/MysqlTreeDataProvider";
import { Console } from "./OutputChannel";
"use strict";

export class ViewOption {
    viewPath?: string;
    viewTitle?: string;
    splitResultView: boolean = false;
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

    public static createWebviewPanel(viewOption: ViewOption): Promise<WebviewPanel> {

        let columnType = viewOption.splitResultView ? vscode.ViewColumn.Two : vscode.ViewColumn.One

        return new Promise((resolve, reject) => {
            fs.readFile(`${this.extensionPath}/resources/webview/${viewOption.viewPath}.html`, 'utf8', async (err, data) => {
                if (err) {
                    Console.log(err)
                    reject(err)
                    return;
                }
                const webviewPanel = vscode.window.createWebviewPanel(
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