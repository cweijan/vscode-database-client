import * as uuidv1 from "uuid/v1";
import * as vscode from "vscode";
import { AppInsightsClient } from "../common/appInsightsClient";
import { Constants } from "../common/constants";
import { Global } from "../common/global";
import { IConnection } from "../model/connection";
import { ConnectionNode } from "../model/ConnectionNode";
import { INode } from "../model/INode";
import { DatabaseCache } from "../database/DatabaseCache";

export class MySQLTreeDataProvider implements vscode.TreeDataProvider<INode> {
    public _onDidChangeTreeData: vscode.EventEmitter<INode> = new vscode.EventEmitter<INode>();
    public readonly onDidChangeTreeData: vscode.Event<INode> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {
        this.init()
    }

    async init() {
        if (DatabaseCache.obtainStoreCache()) {
            return;
        }

        (await this.getConnectionNodes()).forEach(async connectionNode => {
            (await connectionNode.getChildren()).forEach(async databaseNode => {
                (await databaseNode.getChildren()).forEach(tableNode => {
                    tableNode.getChildren()
                })
            })
        })
        setTimeout(()=>{
            DatabaseCache.storeCurrentCache()
        },10000)
    }

    public getTreeItem(element: INode): Promise<vscode.TreeItem> | vscode.TreeItem {
        return element.getTreeItem();
    }

    public getChildren(element?: INode): Thenable<INode[]> | INode[] {
        if (!element) {
            return this.getConnectionNodes();
        }

        return element.getChildren();
    }

    public async addConnection() {
        AppInsightsClient.sendEvent("addConnection.start");
        const host = await vscode.window.showInputBox({ prompt: "The hostname of the database", placeHolder: "host", ignoreFocusOut: true, value: "localhost" });
        if (!host) {
            return;
        }

        const user = await vscode.window.showInputBox({ prompt: "The MySQL user to authenticate as", placeHolder: "user", ignoreFocusOut: true, value: "root" });
        if (!user) {
            return;
        }

        const password = await vscode.window.showInputBox({ prompt: "The password of the MySQL user", placeHolder: "password", ignoreFocusOut: true, password: true });
        if (password === undefined) {
            return;
        }

        const port = await vscode.window.showInputBox({ prompt: "The port number to connect to", placeHolder: "port", ignoreFocusOut: true, value: "3306" });
        if (!port) {
            return;
        }

        // const certPath = await vscode.window.showInputBox({ prompt: "[Optional] SSL certificate path. Leave empty to ignore", placeHolder: "certificate file path", ignoreFocusOut: true });
        // if (certPath === undefined) {
        //     return;
        // }
        const certPath = ''

        let connections = this.context.globalState.get<{ [key: string]: IConnection }>(Constants.GlobalStateMySQLConectionsKey);

        if (!connections) {
            connections = {};
        }

        const id = uuidv1();
        connections[id] = {
            host,
            user,
            port,
            certPath,
        };

        if (password) {
            await Global.keytar.setPassword(Constants.ExtensionId, id, password);
        }
        await this.context.globalState.update(Constants.GlobalStateMySQLConectionsKey, connections);
        this.refresh();
        AppInsightsClient.sendEvent("addConnection.end");
    }

    public refresh(element?: INode): void {
        this._onDidChangeTreeData.fire(element);
    }

    public async getConnectionNodes(): Promise<ConnectionNode[]> {
        const connections = this.context.globalState.get<{ [key: string]: IConnection }>(Constants.GlobalStateMySQLConectionsKey);
        const ConnectionNodes = [];
        if (connections) {
            for (const id of Object.keys(connections)) {
                const password = await Global.keytar.getPassword(Constants.ExtensionId, id);
                ConnectionNodes.push(new ConnectionNode(id, connections[id].host, connections[id].user, password, connections[id].port, connections[id].certPath));
                if (!Global.activeConnection) {
                    Global.activeConnection = {
                        host: connections[id].host,
                        user: connections[id].user,
                        password,
                        port: connections[id].port,
                        certPath: connections[id].certPath,
                    };
                }
            }
        }
        return ConnectionNodes;
    }
}
