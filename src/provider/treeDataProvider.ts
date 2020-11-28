import * as vscode from "vscode";
import { CacheKey, ConfigKey } from "../common/constants";
import { ConnectionManager } from "../service/connectionManager";
import { DatabaseCache } from "../service/common/databaseCache";
import { ConnectionNode } from "../model/database/connectionNode";
import { DatabaseNode } from "../model/database/databaseNode";
import { Node } from "../model/interface/node";
import { UserGroup } from "../model/database/userGroup";
import { Global } from "../common/global";

export class DbTreeDataProvider implements vscode.TreeDataProvider<Node> {

    public _onDidChangeTreeData: vscode.EventEmitter<Node> = new vscode.EventEmitter<Node>();
    public readonly onDidChangeTreeData: vscode.Event<Node> = this._onDidChangeTreeData.event;
    private static instance: DbTreeDataProvider

    constructor(private context: vscode.ExtensionContext) {
        DbTreeDataProvider.instance = this
        this.init()
    }

    /**
     * reload treeview context
     */
    public async init() {
        if (Global.getConfig<boolean>(ConfigKey.LOAD_META_ON_CONNECT)) {
            (await this.getConnectionNodes()).forEach(async (connectionNode) => {
                (await connectionNode.getChildren(true)).forEach(async (databaseNode) => {
                    (await databaseNode.getChildren(true)).forEach(async (groupNode) => {
                        groupNode.getChildren(true);
                    });
                });
            })
        } else {
            DatabaseCache.clearDatabaseCache()
            DatabaseCache.clearTableCache()
        }
        DatabaseCache.clearColumnCache()
        DbTreeDataProvider.refresh()
    }

    public getTreeItem(element: Node): Promise<vscode.TreeItem> | vscode.TreeItem {
        return element;
    }

    public getChildren(element?: Node): Thenable<Node[]> | Node[] {
        if (!element) {
            return this.getConnectionNodes();
        }

        return element.getChildren();
    }

    public async addConnection(connectionNode: Node) {


        // if is add from edit, clear previous connection info.
        const editGlobal = (connectionNode as any).isGlobal;
        if (editGlobal != null) {
            const oldContext = editGlobal === false ? this.context.workspaceState : this.context.globalState;
            const oldConnections = oldContext.get<{ [key: string]: Node }>(CacheKey.ConectionsKey)
            delete oldConnections[connectionNode.getConnectId(editGlobal)]
            await oldContext.update(CacheKey.ConectionsKey, oldConnections);
        }

        const targetContext = connectionNode.global === false ? this.context.workspaceState : this.context.globalState;

        let connections = targetContext.get<{ [key: string]: Node }>(CacheKey.ConectionsKey, {});

        const connectId = connectionNode.getConnectId();
        connections[connectId] = connectionNode;
        ConnectionManager.removeConnection(connectId)

        await targetContext.update(CacheKey.ConectionsKey, connections);
        DbTreeDataProvider.refresh();
    }

    /**
     * refresh treeview context
     */
    public static refresh(element?: Node): void {
        this.instance._onDidChangeTreeData.fire(element);
    }

    public static getInstnace() {
        return this.instance;
    }

    public async getConnectionNodes(): Promise<ConnectionNode[]> {
        const connectionNodes = [];
        const map = {};
        let connections = this.context.globalState.get<{ [key: string]: Node }>(CacheKey.ConectionsKey);
        if (connections) {
            for (const key of Object.keys(connections)) {
                connections[key].global = true;
                const connection = new ConnectionNode(key, connections[key]);
                delete connections[key]
                const connectId = connection.getConnectId();
                if (map[connectId]) {
                    continue;
                }
                map[connectId] = connection
                connections[connectId] = connection
                connectionNodes.push(connection);
            }
        }
        await this.context.globalState.update(CacheKey.ConectionsKey, connections);

        connections = this.context.workspaceState.get<{ [key: string]: Node }>(CacheKey.ConectionsKey);
        if (connections) {
            for (const key of Object.keys(connections)) {
                connections[key].global = false;
                const connection = new ConnectionNode(key, connections[key]);
                delete connections[key]
                const connectId = connection.getConnectId();
                if (map[connectId]) {
                    continue;
                }
                map[connectId] = connection
                connections[connectId] = connection
                connectionNodes.push(connection);
            }
        }
        await this.context.workspaceState.update(CacheKey.ConectionsKey, connections);

        return connectionNodes;
    }

    public async activeDb() {

        const dbIdList: string[] = [];
        const dbIdMap = new Map<string, DatabaseNode>();
        const numbers = (await this.getConnectionNodes()).length > 1
        for (const dbNode of DatabaseCache.getDatabaseNodeList()) {
            if (dbNode instanceof UserGroup) { continue }
            const id = numbers ? dbNode.id : dbNode.database
            dbIdList.push(id)
            dbIdMap.set(id, dbNode)
        }
        if (dbIdList) {
            vscode.window.showQuickPick(dbIdList).then(async (dbId) => {
                if (dbId) {
                    const dbNode = dbIdMap.get(dbId);
                    await ConnectionManager.getConnection(dbNode, true)
                    vscode.window.showInformationMessage(`Change active database to ${dbNode.database} success!`)
                }

            })
        }

    }

}