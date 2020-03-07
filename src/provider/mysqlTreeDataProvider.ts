import * as vscode from "vscode";
import { CacheKey } from "../common/Constants";
import { IConnection } from "../model/Connection";
import { ConnectionNode } from "../model/ConnectionNode";
import { INode } from "../model/INode";

export class MySQLTreeDataProvider implements vscode.TreeDataProvider<INode> {
    public _onDidChangeTreeData: vscode.EventEmitter<INode> = new vscode.EventEmitter<INode>();
    public readonly onDidChangeTreeData: vscode.Event<INode> = this._onDidChangeTreeData.event;
    public static instance:MySQLTreeDataProvider

    constructor(private context: vscode.ExtensionContext) {
        MySQLTreeDataProvider.instance=this
        this.init()

    }

    async init() {
        await (await this.getConnectionNodes()).forEach(async connectionNode => {
            (await connectionNode.getChildren(true)).forEach(async databaseNode => {
                (await databaseNode.getChildren(true)).forEach(async tableNode => {
                    tableNode.getChildren(true)
                })
            })
        })
        MySQLTreeDataProvider.refresh()
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

        let connections = this.context.globalState.get<{ [key: string]: IConnection }>(CacheKey.ConectionsKey);

        if (!connections) {
            connections = {};
        }

        connections[`${connectionOptions.host}_${connectionOptions.port}_${connectionOptions.user}`] = connectionOptions;
        
        await this.context.globalState.update(CacheKey.ConectionsKey, connections);
        MySQLTreeDataProvider.refresh();
    }

    public static refresh(element?: INode): void {
        this.instance._onDidChangeTreeData.fire(element);
    }

    public async getConnectionNodes(): Promise<ConnectionNode[]> {
        const connectionNodes = [];
        const connections = this.context.globalState.get<{ [key: string]: IConnection }>(CacheKey.ConectionsKey);
        if (connections) {
            for (const key of Object.keys(connections)) {
                connectionNodes.push(new ConnectionNode(key, connections[key].host, connections[key].user, connections[key].password, connections[key].port, connections[key].certPath));
            }
        }
        return connectionNodes;
    }
}