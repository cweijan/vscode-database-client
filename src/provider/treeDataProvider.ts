import * as vscode from "vscode";
import { CacheKey, ConfigKey, DatabaseType } from "../common/constants";
import { ConnectionManager } from "../service/connectionManager";
import { DatabaseCache } from "../service/common/databaseCache";
import { ConnectionNode } from "../model/database/connectionNode";
import { DatabaseNode } from "../model/database/databaseNode";
import { CommandKey, Node } from "../model/interface/node";
import { UserGroup } from "../model/database/userGroup";
import { Global } from "../common/global";
import { NodeUtil } from "@/model/nodeUtil";
import { InfoNode } from "@/model/other/infoNode";
import { EsConnectionNode } from "@/model/es/model/esConnectionNode";
import { RedisConnectionNode } from "@/model/redis/redisConnectionNode";

export class DbTreeDataProvider implements vscode.TreeDataProvider<Node> {

    public _onDidChangeTreeData: vscode.EventEmitter<Node> = new vscode.EventEmitter<Node>();
    public readonly onDidChangeTreeData: vscode.Event<Node> = this._onDidChangeTreeData.event;
    private static instances: DbTreeDataProvider[] = []

    constructor(protected context: vscode.ExtensionContext, public readonly connectionKey: string) {
        DbTreeDataProvider.instances.push(this)
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

    public async openConnection(connectionNode: ConnectionNode) {
        connectionNode.disable = false;
        connectionNode.indent({ command: CommandKey.update })
    }

    public async disableConnection(connectionNode: ConnectionNode) {
        connectionNode.disable = true;
        connectionNode.indent({ command: CommandKey.update })
    }

    public async addConnection(node: Node) {

        if ((node as any).isGlobal != null) {
            await node.indent({ command: CommandKey.delete })
        }

        node.context = node.global === false ? this.context.workspaceState : this.context.globalState
        node.indent({ command: CommandKey.add, cacheKey: this.getKeyByNode(node) })

    }

    private getKeyByNode(connectionNode: Node): string {
        const dbType = connectionNode.dbType;
        if (dbType == DatabaseType.ES || dbType == DatabaseType.REDIS) {
            return CacheKey.NOSQL_CONNECTION;
        }
        return CacheKey.ConectionsKey;
    }


    public reload(element?:Node){
        this._onDidChangeTreeData.fire(element);
    }

    /**
     * refresh treeview context
     */
    public static refresh(element?: Node): void {
        for (const instance of this.instances) {
            instance._onDidChangeTreeData.fire(element);
        }
    }

    public static getInstnace() {
        return this.instances;
    }

    public async getConnectionNodes(): Promise<Node[]> {

        let globalConnections = this.context.globalState.get<{ [key: string]: Node }>(this.connectionKey, {});
        let workspaceConnections = this.context.workspaceState.get<{ [key: string]: Node }>(this.connectionKey, {});

        const connections = { ...globalConnections, ...workspaceConnections };

        return Object.keys(connections).map(key => {
            const connectInfo = connections[key];
            return this.getNode(connectInfo, key);
        })

    }

    private getNode(connectInfo: Node, key: string) {
        let node: Node;
        if (connectInfo.dbType == DatabaseType.ES) {
            node = new EsConnectionNode(key, connectInfo);
        }else if (connectInfo.dbType == DatabaseType.REDIS) {
            node = new RedisConnectionNode(key, connectInfo)
        } else {
            node = new ConnectionNode(key, connectInfo)
        }
        node.provider = this
        // Compatible with older versions
        if (node.global !== false) {
            node.global = true;
        }
        node.context = node.global === false ? this.context.workspaceState : this.context.globalState;
        return node;
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
