import { WebviewPanel } from "vscode";
"use strict";
import * as fs from "fs";
import * as vscode from "vscode";
import { OutputChannel } from "../common/outputChannel";

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


    public static showQueueResult(data:any,title:string){

        this.createWebviewPanel({
            viewId: "queryResult",
            viewPath: "result",
            viewTitle: title
        }).then(webviewPanel=>{
            webviewPanel.webview.postMessage({data:data})
        })
    }

    private static createWebviewPanel(viewOption: ViewOption): Promise<WebviewPanel> {

        return new Promise((resolve, reject) => {
            fs.readFile(`${this.extensionPath}/resources/webview/${viewOption.viewPath}.html`, 'utf8', async (err, data) => {
                if (err) {
                    OutputChannel.appendLine(err)
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