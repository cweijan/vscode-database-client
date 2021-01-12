import * as vscode from "vscode";
import { CacheKey, ConfigKey } from "../common/constants";
import { ConnectionManager } from "../service/connectionManager";
import { DatabaseCache } from "../service/common/databaseCache";
import { ConnectionNode } from "../model/database/connectionNode";
import { DatabaseNode } from "../model/database/databaseNode";
import { Node } from "../model/interface/node";
import { UserGroup } from "../model/database/userGroup";
import { Global } from "../common/global";
import { NodeUtil } from "@/model/nodeUtil";
import { InfoNode } from "@/model/other/infoNode";

export class DbTreeDataProvider implements vscode.TreeDataProvider<Node> {

    public _onDidChangeTreeData: vscode.EventEmitter<Node> = new vscode.EventEmitter<Node>();
    public readonly onDidChangeTreeData: vscode.Event<Node> = this._onDidChangeTreeData.event;
    private static instance: DbTreeDataProvider

    constructor(private context: vscode.ExtensionContext) {
        DbTreeDataProvider.instance = this
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
        try {
            return element.getChildren();
        } catch (error) {
            return [new InfoNode(error)]
        }
    }

    public async addConnection(connectionNode: Node) {

        await this.removeOldConnection(connectionNode);

        const targetContext = connectionNode.global === false ? this.context.workspaceState : this.context.globalState;
        let connections = targetContext.get<{ [key: string]: Node }>(CacheKey.ConectionsKey, {});
        const connectId = connectionNode.getConnectId();
        connections[connectId] = connectionNode;
        ConnectionManager.removeConnection(connectId)
        await targetContext.update(CacheKey.ConectionsKey, NodeUtil.removeParent(connections));
        DbTreeDataProvider.refresh();
        
    }

    /**
     * if is add from edit, clear previous connection info.
     * isGlobal is a temp properties.
     */
    private async removeOldConnection(connectionNode: Node) {
        const editGlobal = (connectionNode as any).isGlobal;
        if (editGlobal != null) {
            const isGlobal = editGlobal !== false;
            const oldContext = isGlobal ? this.context.globalState : this.context.workspaceState;
            const oldConnections = oldContext.get<{ [key: string]: Node; }>(CacheKey.ConectionsKey);
            delete oldConnections[connectionNode.getConnectId({ isGlobal })];
            await oldContext.update(CacheKey.ConectionsKey, NodeUtil.removeParent(oldConnections));
        }
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

        let globalConnections = this.context.globalState.get<{ [key: string]: Node }>(CacheKey.ConectionsKey, {});
        let workspaceConnections = this.context.workspaceState.get<{ [key: string]: Node }>(CacheKey.ConectionsKey, {});

        const connections = { ...globalConnections, ...workspaceConnections };
        // temp duplicate uid solution
        const idMap = {};

        return Object.keys(connections).map(key => {
            const connection = new ConnectionNode(key, connections[key]);
            idMap[connection.uid] = true;
            if (typeof connections[key].global == "undefined") {
                // Compatible with older versions, will remove in the feature
                connections[key].global = true;
            }
            if (idMap[connection.uid]) {
                idMap[connection.uid] = idMap[connection.uid] + new Date().getTime()
            }
            return connection;
        })

    }

    public async activeDb() {

        const dbIdList: string[] = [];
        const dbIdMap = new Map<string, DatabaseNode>();
        const numbers = (await this.getConnectionNodes()).length > 1
        for (const dbNode of DatabaseCache.getDatabaseNodeList()) {
            if (dbNode instanceof UserGroup) { continue }
            const uid = numbers ? dbNode.uid : dbNode.database
            dbIdList.push(uid)
            dbIdMap.set(uid, dbNode)
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
