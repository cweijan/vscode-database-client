import * as vscode from "vscode";
import { Constants, CacheKey } from "../common/Constants";
import { IConnection } from "../model/Connection";
import { ConnectionNode } from "../model/ConnectionNode";
import { INode } from "../model/INode";
import { DatabaseCache } from "../database/DatabaseCache";
import { State } from "../common/State";

export class MySQLTreeDataProvider implements vscode.TreeDataProvider<INode> {
    public _onDidChangeTreeData: vscode.EventEmitter<INode> = new vscode.EventEmitter<INode>();
    public readonly onDidChangeTreeData: vscode.Event<INode> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {
        setInterval(()=>{
            //save current data case per 30 minute
            DatabaseCache.storeCurrentCache(false)
        },30*60*1000)
        this.init()
    }

    async init() {
        if (DatabaseCache.obtainStoreCache()) {
            return;
        }

        (await this.getConnectionNodes()).forEach(async connectionNode => {
            (await connectionNode.getChildren(true)).forEach(async databaseNode => {
                (await databaseNode.getChildren(true)).forEach(tableNode => {
                    tableNode.getChildren(true)
                })
            })
        })
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
        this.refresh();
    }

    public refresh(element?: INode): void {
        this._onDidChangeTreeData.fire(element);
    }

    public async getConnectionNodes(): Promise<ConnectionNode[]> {
        const connectionNodes = [];
        const connections = this.context.globalState.get<{ [key: string]: IConnection }>(CacheKey.ConectionsKey);
        if (connections) {
            for (const key of Object.keys(connections)) {
                connectionNodes.push(new ConnectionNode(key, connections[key].host, connections[key].user, connections[key].password, connections[key].port, connections[key].certPath));
            }
        }
        if(connectionNodes.length>0)State.currentConnection=connectionNodes[0];
        return connectionNodes;
    }
}