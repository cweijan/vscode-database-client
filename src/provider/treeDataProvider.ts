import { GlobalState, WorkState } from "@/common/state";
import { CatalogNode } from "@/model/database/catalogNode";
import { EsConnectionNode } from "@/model/es/model/esConnectionNode";
import { FTPConnectionNode } from "@/model/ftp/ftpConnectionNode";
import { InfoNode } from "@/model/other/infoNode";
import { RedisConnectionNode } from "@/model/redis/redisConnectionNode";
import { SSHConnectionNode } from "@/model/ssh/sshConnectionNode";
import SQLite from "@/service/connect/sqlite";
import * as vscode from "vscode";
import { CacheKey, DatabaseType } from "../common/constants";
import { ConnectionNode } from "../model/database/connectionNode";
import { SchemaNode } from "../model/database/schemaNode";
import { UserGroup } from "../model/database/userGroup";
import { CommandKey, Node } from "../model/interface/node";
import { DatabaseCache } from "../service/common/databaseCache";
import { ConnectionManager } from "../service/connectionManager";

export class DbTreeDataProvider implements vscode.TreeDataProvider<Node> {

    public _onDidChangeTreeData: vscode.EventEmitter<Node> = new vscode.EventEmitter<Node>();
    public readonly onDidChangeTreeData: vscode.Event<Node> = this._onDidChangeTreeData.event;
    public static instances: DbTreeDataProvider[] = []

    constructor(protected context: vscode.ExtensionContext, public connectionKey: string) {
        DbTreeDataProvider.instances.push(this)
    }

    public getTreeItem(element: Node): Promise<vscode.TreeItem> | vscode.TreeItem {
        return element;
    }

    public getParent(element?: Node) {
        return element?.parent;
    }

    public async getChildren(element?: Node): Promise<Node[]> {
        return new Promise(async (res, rej) => {
            if (!element) {
                res(this.getConnectionNodes())
                return;
            }
            try {
                let mark = setTimeout(() => {
                    res([new InfoNode(`Connect time out!`)])
                    mark = null;
                }, element.connectTimeout || 5000);
                const children = await element.getChildren();
                if (mark) {
                    clearTimeout(mark)
                    for (const child of children) {
                        child.parent = element;
                    }
                    res(children);
                } else {
                    this.reload(element)
                }
            } catch (error) {
                res([new InfoNode(error)])
            }
        })
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

        const newKey = this.getKeyByNode(node)

        const isGlobal = (node as any).isGlobal;
        const configNotChange = newKey == node.connectionKey && isGlobal == node.global
        if (configNotChange) {
            await node.indent({ command: CommandKey.update })
            return;
        }

        // config has change, remove old connection.
        if (isGlobal != null) {
            await node.indent({ command: CommandKey.delete, connectionKey: node.connectionKey, refresh: false }, isGlobal)
        }

        node.connectionKey = newKey
        await node.indent({ command: CommandKey.add, connectionKey: newKey })

    }

    private getKeyByNode(connectionNode: Node): string {
        const dbType = connectionNode.dbType;
        if (dbType == DatabaseType.ES || dbType == DatabaseType.REDIS || dbType == DatabaseType.SSH || dbType == DatabaseType.FTP || dbType == DatabaseType.MONGO_DB) {
            return CacheKey.NOSQL_CONNECTION;
        }
        return CacheKey.DATBASE_CONECTIONS;
    }


    public reload(element?: Node) {
        this._onDidChangeTreeData.fire(element);
    }

    /**
     * refresh treeview context
     */
    public static refresh(element?: Node): void {
        for (const instance of this.instances) {
            if (element && element.connectionKey != instance.connectionKey) continue;
            instance._onDidChangeTreeData.fire(element);
        }
    }

    public static getInstnace() {
        return this.instances;
    }

    public getConnectionNodes(): Node[] {

        const connetKey = this.connectionKey;
        const oldKey = connetKey == CacheKey.DATBASE_CONECTIONS ? "mysql.connections" : "redis.connections";
        let regacyGlobalConnections = GlobalState.get<{ [key: string]: Node }>(oldKey, {});
        let globalConnections = GlobalState.get<{ [key: string]: Node }>(connetKey, {});
        let workspaceConnections = WorkState.get<{ [key: string]: Node }>(connetKey, {});

        const connections = [
            ...Object.keys(workspaceConnections).map(key => this.getNode(workspaceConnections[key], key, false, connetKey)),
            ...Object.keys(regacyGlobalConnections).map(key => this.getNode(regacyGlobalConnections[key], key, true, oldKey)),
            ...Object.keys(globalConnections).map(key => this.getNode(globalConnections[key], key, true, connetKey))
        ]

        return connections.length > 0 ? connections : [new InfoNode("You haven't created any connections")];

    }

    private getNode(connectInfo: Node, key: string, global: boolean, connectionKey: string) {
        // 兼容老版本的连接信息
        if (!connectInfo.dbType) connectInfo.dbType = DatabaseType.MYSQL
        let node: Node;
        if (connectInfo.dbType == DatabaseType.ES) {
            node = new EsConnectionNode(key, connectInfo);
        } else if (connectInfo.dbType == DatabaseType.REDIS) {
            node = new RedisConnectionNode(key, connectInfo)
        } else if (connectInfo.dbType == DatabaseType.SSH) {
            connectInfo.ssh.key = connectInfo.key
            node = new SSHConnectionNode(key, connectInfo, connectInfo.ssh, connectInfo.name)
        } else if (connectInfo.dbType == DatabaseType.FTP) {
            node = new FTPConnectionNode(key, connectInfo)
        } else {
            node = new ConnectionNode(key, connectInfo)
        }
        node.connectionKey = connectionKey;
        node.provider = this
        node.global = global;
        if (!node.global) {
            node.description = `${node.description || ''} workspace`
        }
        return node;
    }

    public async activeDb() {

        const node = ConnectionManager.getByActiveFile()
        if (node) {
            vscode.window.showErrorMessage("Query file can not change active database.")
            return;
        }

        const connectNode = await this.pickConnectNode(node);
        if (!connectNode) return;
        if (connectNode instanceof SQLite) {
            ConnectionManager.changeActive(connectNode)
            return;
        }

        const dbMap = await this.getDbMap(connectNode);
        const dbList = Object.keys(dbMap)
        if (dbList.length == 0) {
            ConnectionManager.changeActive(node)
        } else {
            vscode.window.showQuickPick(dbList).then(async (dbName) => {
                if (dbName) {
                    const dbNode = dbMap[dbName];
                    ConnectionManager.changeActive(dbNode)
                }
            })
        }

    }

    private async pickConnectNode(node: Node): Promise<Node> {
        const connectionMap: { [key: string]: Node } = {};
        const connectionLabels: vscode.QuickPickItem[] = this.getConnectionNodes().filter(connectNode => !connectNode.disable && !(connectNode instanceof InfoNode)).map(node => {
            connectionMap[node.label] = node;
            return { label: node.label, description: node.dbType };
        })
        if (connectionLabels.length == 0) {
            vscode.window.showErrorMessage("You need to create the connection first!")
            return;
        }

        const connectId = await vscode.window.showQuickPick(connectionLabels)
        if (!connectId) return;
        return connectionMap[connectId.label];
    }

    private async getDbMap(node: Node): Promise<{ [key: string]: Node }> {
        const dbMap: { [key: string]: Node } = {};
        if (node.dbType == DatabaseType.MSSQL || node.dbType == DatabaseType.PG) {
            for (const catalogNode of (await node.getChildren())) {
                if (catalogNode instanceof UserGroup) continue;
                for (const schemaNode of (await catalogNode.getChildren())) {
                    dbMap[`${schemaNode.database}#${schemaNode.schema}`] = schemaNode;
                }
            }
        }

        for (const schemaNode of (await node.getChildren())) {
            if (schemaNode instanceof UserGroup || schemaNode instanceof CatalogNode) continue;
            dbMap[`${schemaNode.schema}`] = schemaNode;
        }
        return dbMap;
    }

}
