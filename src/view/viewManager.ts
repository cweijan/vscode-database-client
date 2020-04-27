import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { WebviewPanel } from "vscode";
import { ConnectionManager } from "../service/connectionManager";
import { Console } from "../common/OutputChannel";
import { MySQLTreeDataProvider } from "../provider/treeDataProvider";
import * as AsyncLock from 'async-lock'
const lock = new AsyncLock()

export class ViewOption {
    public path?: string;
    public title?: string;
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
        this.webviewPath = extensionPath + "/resources/webview"
    }

    public static showConnectPage(provider: MySQLTreeDataProvider) {

        this.createWebviewPanel({
            path: "pages/connect/connect",
            title: "connect",
            splitView: false,
            receiveListener: (webviewPanel, params) => {
                if (params.type === 'CONNECT_TO_SQL_SERVER') {
                    const { connectionOption } = params
                    if (connectionOption.usingSSH) {
                        connectionOption.origin = { host: connectionOption.host, user: connectionOption.user, port: connectionOption.port, password: connectionOption.password }
                        connectionOption.host = connectionOption.ssh.host
                        connectionOption.port = "" + connectionOption.ssh.port
                    }
                    ConnectionManager.getConnection(connectionOption).then(() => {
                        provider.addConnection(params.connectionOption);
                        webviewPanel.dispose();
                    }).catch((err: Error) => {
                        webviewPanel.webview.postMessage({
                            type: 'CONNECTION_ERROR',
                            err,
                        });
                    });
                }
            }
        });
    }

    public static createWebviewPanel(viewOption: ViewOption): Promise<WebviewPanel> {

        return new Promise((resolve, reject) => {

            lock.acquire("viewManager", (done) => {
                if (typeof (viewOption.singlePage) == 'undefined') { viewOption.singlePage = true }
                if (typeof (viewOption.killHidden) == 'undefined') { viewOption.killHidden = true }

                const currentStatus = this.viewStatu[viewOption.title]
                if (viewOption.singlePage && currentStatus) {
                    if (viewOption.killHidden && currentStatus.instance.visible == false) {
                        currentStatus.instance.dispose()
                    } else {
                        if (currentStatus.creating) {
                            currentStatus.initListener = viewOption.initListener
                        } else if (viewOption.initListener) {
                            viewOption.initListener(currentStatus.instance)
                        }
                        if (viewOption.receiveListener) { currentStatus.receiveListener = viewOption.receiveListener }
                        done()
                        return Promise.resolve(currentStatus.instance);
                    }
                }
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
                        { enableScripts: true, retainContextWhenHidden: true },
                    );
                    webviewPanel.webview.html = this.buildInclude(this.buildPath(data), path.resolve(targetPath, ".."));
                    this.viewStatu[viewOption.title] = {
                        creating: true,
                        instance: webviewPanel,
                        initListener: viewOption.initListener,
                        receiveListener: viewOption.receiveListener
                    }
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
                    done();
                });
            })

        });

    }
    private static buildInclude(data: string, fileFolderPath: string): string {

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