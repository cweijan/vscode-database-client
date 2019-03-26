import * as uuidv1 from "uuid/v1";
import * as vscode from "vscode";
import { AppInsightsClient } from "../common/appInsightsClient";
import { Constants } from "../common/Constants";
import { Global } from "../common/Global";
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

    public async addConnection(connectionOptions: IConnection) {
        AppInsightsClient.sendEvent("addConnection.start");

        const password=connectionOptions.password
        delete connectionOptions.password

        let connections = this.context.globalState.get<{ [key: string]: IConnection }>(Constants.GlobalStateMySQLConectionsKey);

        if (!connections) {
            connections = {};
        }

        const id = uuidv1();
        
        connections[id] = connectionOptions;

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
            }
        }
        return ConnectionNodes;
    }
}
