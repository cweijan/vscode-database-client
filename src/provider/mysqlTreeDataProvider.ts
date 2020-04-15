import * as vscode from "vscode";
import { CacheKey } from "../common/Constants";
import { ConnectionInfo } from "../model/interface/connection";
import { ConnectionNode } from "../model/ConnectionNode";
import { Node } from "../model/interface/node";
import { DatabaseCache } from "../database/DatabaseCache";

export class MySQLTreeDataProvider implements vscode.TreeDataProvider<Node> {
    public _onDidChangeTreeData: vscode.EventEmitter<Node> = new vscode.EventEmitter<Node>();
    public readonly onDidChangeTreeData: vscode.Event<Node> = this._onDidChangeTreeData.event;
    public static instance:MySQLTreeDataProvider

    constructor(private context: vscode.ExtensionContext) {
        MySQLTreeDataProvider.instance=this
        this.init()

    }

    /**
     * reload treeview context
     */
    async init() {
        await (await this.getConnectionNodes()).forEach(async connectionNode => {
            (await connectionNode.getChildren(true)).forEach(async databaseNode => {
                (await databaseNode.getChildren(true)).forEach(async tableNode => {
                    tableNode.getChildren(true)
                })
            })
        })
        DatabaseCache.clearColumnCache()
        MySQLTreeDataProvider.refresh()
    }

    public getTreeItem(element: Node): Promise<vscode.TreeItem> | vscode.TreeItem {
        return element.getTreeItem();
    }

    public getChildren(element?: Node): Thenable<Node[]> | Node[] {
        if (!element) {
            return this.getConnectionNodes();
        }

        return element.getChildren();
    }

    public async addConnection(connectionOptions: ConnectionInfo) {

        let connections = this.context.globalState.get<{ [key: string]: ConnectionInfo }>(CacheKey.ConectionsKey);

        if (!connections) {
            connections = {};
        }

        connections[`${connectionOptions.host}_${connectionOptions.port}_${connectionOptions.user}`] = connectionOptions;
        
        await this.context.globalState.update(CacheKey.ConectionsKey, connections);
        MySQLTreeDataProvider.refresh();
    }

    /**
     * refresh treeview context
     */
    public static refresh(element?: Node): void {
        this.instance._onDidChangeTreeData.fire(element);
    }

    public async getConnectionNodes(): Promise<ConnectionNode[]> {
        const connectionNodes = [];
        const connections = this.context.globalState.get<{ [key: string]: ConnectionInfo }>(CacheKey.ConectionsKey);
        if (connections) {
            for (const key of Object.keys(connections)) {
                connectionNodes.push(new ConnectionNode(key, connections[key].host, connections[key].user, connections[key].password, connections[key].port, connections[key].certPath));
            }
        }
        return connectionNodes;
    }
}