import * as vscode from "vscode";
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

        let connections = this.context.globalState.get<{ [key: string]: IConnection }>(Constants.GlobalStateMySQLConectionsKey);

        if (!connections) {
            connections = {};
        }

        connections[`${connectionOptions.host}_${connectionOptions.port}_${connectionOptions.user}`] = connectionOptions;
        
        await this.context.globalState.update(Constants.GlobalStateMySQLConectionsKey, connections);
        this.refresh();
    }

    public refresh(element?: INode): void {
        this._onDidChangeTreeData.fire(element);
    }

    public async getConnectionNodes(): Promise<ConnectionNode[]> {
        const ConnectionNodes = [];
        const connections = this.context.globalState.get<{ [key: string]: IConnection }>(Constants.GlobalStateMySQLConectionsKey);
        if (connections) {
            for (const key of Object.keys(connections)) {
                ConnectionNodes.push(new ConnectionNode(key, connections[key].host, connections[key].user, connections[key].password, connections[key].port, connections[key].certPath));
            }
        }
        return ConnectionNodes;
    }
}
