import * as path from "path";
import * as vscode from "vscode";
import { Constants } from "./common/constants";
import { IConnection } from "./model/connection";
import { ConnectionNode } from "./model/connectionNode";
import { INode } from "./model/INode";

export class MySQLTreeDataProvider implements vscode.TreeDataProvider<INode> {
    public _onDidChangeTreeData: vscode.EventEmitter<INode> = new vscode.EventEmitter<INode>();
    public readonly onDidChangeTreeData: vscode.Event<INode> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {
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
        let connections = this.context.globalState.get<IConnection[]>(Constants.GlobalStateMySQLConectionsKey);
        if (!connections) {
            connections = [];
        }
        connections.push({
            host: "hendry-mysql.mysql.database.azure.com",
            user: "mysqluser@hendry-mysql",
            password: "",
            port: 3306,
        });
        await this.context.globalState.update(Constants.GlobalStateMySQLConectionsKey, connections);
        this.refresh();
    }

    private refresh(element?: INode): void {
        this._onDidChangeTreeData.fire(element);
    }

    private getConnectionNodes(): ConnectionNode[] {
        const connections = this.context.globalState.get<IConnection[]>(Constants.GlobalStateMySQLConectionsKey);
        return connections.map<ConnectionNode>((connection) => {
            return new ConnectionNode(connection.host, connection.user, connection.password, connection.port);
        });
    }
}
