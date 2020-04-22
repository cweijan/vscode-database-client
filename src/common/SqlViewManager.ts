import * as fs from "fs";
import * as path from "path";
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

    private static webviewPath: string;
    public static initExtesnsionPath(extensionPath: string) {
        this.webviewPath = extensionPath + "/resources/webview"
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
            const targetPath = `${this.webviewPath}/${viewOption.viewPath}.html`;
            fs.readFile(targetPath, 'utf8', async (err, data) => {
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
                webviewPanel.webview.html = this.buildInclude(this.buildPath(data), path.resolve(targetPath, ".."));
                webviewPanel.webview.onDidReceiveMessage(viewOption.receiveListener);
                webviewPanel.onDidDispose(viewOption.disposeListener);

                resolve(webviewPanel);
            });

        });

    }
    static buildInclude(data: string, fileFolderPath: string): string {

        const reg = new RegExp(`<include path="(.+?)" (\\/)?>`, 'ig')
        let match = reg.exec(data)
        while (match != null) {
            const includePath = match[1].startsWith("/") ? this.webviewPath + match[1] : (fileFolderPath + "/" + match[1]);
            const includeContent = fs.readFileSync(includePath, 'utf8')
            if (includeContent) {
                data = data.replace(match[0], includeContent)
            }
            match = reg.exec(data)
        }

        return data;
    }

    private static buildPath(data: string): string {
        return data.replace(/("|')\/?(css|js)\b/gi, "$1" + vscode.Uri.file(`${this.webviewPath}/`).with({ scheme: 'vscode-resource' }).toString() + "/$2");
    }

}