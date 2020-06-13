import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { WebviewPanel } from "vscode";
import { Console } from "../common/outputChannel";

export class ViewOption {
    public iconPath?: string;
    public path: string;
    public title: string;
    public splitView: boolean = false;
    /**
     * keep single page by viewType
     */
    public singlePage?: boolean;
    /**
     * kill exists panel
     */
    public killHidden?: boolean;
    /**
     * receive webview send message 
     */
    public receiveListener?: (viewPanel: WebviewPanel, message: any) => void;
    /**
     * callback when init success.
     */
    public initListener?: (viewPanel: WebviewPanel) => void;
}

interface ViewState {
    instance: WebviewPanel;
    creating: boolean;
    initListener: (viewPanel: WebviewPanel) => void;
    receiveListener: (viewPanel: WebviewPanel, message: any) => void
}

export class ViewManager {

    private static viewStatu: { [key: string]: ViewState } = {};
    private static webviewPath: string;
    public static initExtesnsionPath(extensionPath: string) {
        this.webviewPath = extensionPath + "/out/webview"
    }

    public static createWebviewPanel(viewOption: ViewOption): Promise<WebviewPanel> {

        return new Promise((resolve, reject) => {

            if (typeof (viewOption.singlePage) == 'undefined') { viewOption.singlePage = true }
            if (typeof (viewOption.killHidden) == 'undefined') { viewOption.killHidden = true }

            if (!viewOption.singlePage) {
                viewOption.title = viewOption.title + new Date().getTime()
            }

            const currentStatus = this.viewStatu[viewOption.title]
            if (viewOption.singlePage && currentStatus) {
                if (viewOption.killHidden && currentStatus.instance?.visible == false) {
                    currentStatus.instance.dispose()
                } else {
                    if (currentStatus.creating) {
                        currentStatus.initListener = viewOption.initListener
                    } else if (viewOption.initListener) {
                        viewOption.initListener(currentStatus.instance)
                    }
                    if (viewOption.receiveListener) { currentStatus.receiveListener = viewOption.receiveListener }
                    return Promise.resolve(currentStatus.instance);
                }
            }
            this.viewStatu[viewOption.title] = { creating: true, instance: null, initListener: viewOption.initListener, receiveListener: viewOption.receiveListener }
            const targetPath = `${this.webviewPath}/${viewOption.path}.html`;
            fs.readFile(targetPath, 'utf8', async (err, data) => {
                if (err) {
                    Console.log(err);
                    reject(err);
                    return;
                }
                const webviewPanel = vscode.window.createWebviewPanel(
                    viewOption.title,
                    viewOption.title,
                    {
                        viewColumn: viewOption.splitView ? vscode.ViewColumn.Two : vscode.ViewColumn.One,
                        preserveFocus: true
                    },
                    { enableScripts: true, retainContextWhenHidden: true }
                );
                this.viewStatu[viewOption.title].instance = webviewPanel
                if (viewOption.iconPath) {
                    webviewPanel.iconPath = vscode.Uri.file(viewOption.iconPath)
                }
                const contextPath = path.resolve(targetPath, "..");
                webviewPanel.webview.html = this.buildPath(data, webviewPanel.webview, contextPath);

                webviewPanel.onDidDispose(() => {
                    this.viewStatu[viewOption.title] = null
                })
                const newStatus = this.viewStatu[viewOption.title]
                webviewPanel.webview.onDidReceiveMessage((message) => {
                    if (message.type == 'init') {
                        newStatus.creating = false
                        if (newStatus.initListener) {
                            newStatus.initListener(webviewPanel)
                        }
                    } else if (newStatus.receiveListener) {
                        newStatus.receiveListener(webviewPanel, message)
                    }
                })
                resolve(webviewPanel);
            });

        });

    }

    private static buildPath(data: string, webview: vscode.Webview, contextPath: string): string {
        return data.replace(/((src|href)=("|'))(.+?\.(css|js))\b/gi, "$1" + webview.asWebviewUri(vscode.Uri.file(`${contextPath}/`)) + "/$4");
    }

}