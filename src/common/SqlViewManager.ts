import * as fs from "fs";
import * as vscode from "vscode";
import { WebviewPanel } from "vscode";
import { ConnectionManager } from "../database/ConnectionManager";
import { MySQLTreeDataProvider } from "../provider/MysqlTreeDataProvider";
import { Console } from "./OutputChannel";

export class ViewOption {
    public viewPath?: string;
    public viewTitle?: string;
    public splitResultView: boolean = false;
    /**
     * receive webview send message 
     */
    public receiveListener?: (message: any) => {};

    public disposeListener?: (message: any) => {};
}

export class SqlViewManager {

    private static extensionPath: string;
    public static initExtesnsionPath(extensionPath: string) {
        this.extensionPath = extensionPath;
    }

    public static showConnectPage() {

        this.createWebviewPanel({
            viewPath: "pages/connect/connect",
            viewTitle: "connect",
            splitResultView: false,
        }).then((webviewPanel) => {
            webviewPanel.webview.onDidReceiveMessage((params) => {
                if (params.type === 'CONNECT_TO_SQL_SERVER') {
                    ConnectionManager.getConnection(params.connectionOption).then(() => {
                        MySQLTreeDataProvider.instance.addConnection(params.connectionOption);
                        webviewPanel.dispose();
                    }).catch((err: Error) => {
                        webviewPanel.webview.postMessage({
                            type: 'CONNECTION_ERROR',
                            err,
                        });
                    });
                }
            });
        });
    }

    public static createWebviewPanel(viewOption: ViewOption): Promise<WebviewPanel> {

        const columnType = viewOption.splitResultView ? vscode.ViewColumn.Two : vscode.ViewColumn.One;

        return new Promise((resolve, reject) => {
            fs.readFile(`${this.extensionPath}/resources/webview/${viewOption.viewPath}.html`, 'utf8', async (err, data) => {
                if (err) {
                    Console.log(err);
                    reject(err);
                    return;
                }
                const webviewPanel = vscode.window.createWebviewPanel(
                    "mysql.sql.result",
                    viewOption.viewTitle,
                    { viewColumn: columnType, preserveFocus: true },
                    { enableScripts: true, retainContextWhenHidden: true },
                );
                webviewPanel.webview.html = data.replace(/("|')\/?(css|js)\b/gi,
                    "$1" + vscode.Uri.file(`${this.extensionPath}/resources/webview`)
                        .with({ scheme: 'vscode-resource' }).toString() + "/$2");
                webviewPanel.webview.onDidReceiveMessage(viewOption.receiveListener);
                webviewPanel.onDidDispose(viewOption.disposeListener);

                resolve(webviewPanel);
            });

        });

    }

}