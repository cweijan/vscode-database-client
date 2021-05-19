import { CatalogNode } from "@/model/database/catalogNode";
import { EsConnectionNode } from "@/model/es/model/esConnectionNode";
import { FTPConnectionNode } from "@/model/ftp/ftpConnectionNode";
import { InfoNode } from "@/model/other/infoNode";
import { RedisConnectionNode } from "@/model/redis/redisConnectionNode";
import { SSHConnectionNode } from "@/model/ssh/sshConnectionNode";
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

    constructor(protected context: vscode.ExtensionContext, public readonly connectionKey: string) {
        DbTreeDataProvider.instances.push(this)
    }

    public getTreeItem(element: Node): Promise<vscode.TreeItem> | vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: Node): Promise<Node[]> {
        return new Promise(async (res,rej)=>{
            if (!element) {
                res(this.getConnectionNodes())
                return;
            }
            try {
                const mark=setTimeout(() => {
                    res([new InfoNode(`Connect time out!`)])
                }, element.connectTimeout||5000);
                const children = await element.getChildren();
                clearTimeout(mark)
                for (const child of children) {
                    child.parent = element;
                }
                res(children);
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

        node.initKey();
        const newKey = this.getKeyByNode(node)
        node.context = node.global ? this.context.globalState : this.context.workspaceState

        const isGlobal = (node as any).isGlobal;
        const configNotChange = newKey == node.connectionKey && isGlobal == node.global
        if (configNotChange) {
            node.indent({ command: CommandKey.update })
            return;
        } else if (isGlobal != null) {
            // config has change, remove old connection.
            node.context = isGlobal ? this.context.globalState : this.context.workspaceState
            await node.indent({ command: CommandKey.delete, connectionKey: node.connectionKey })
        }

        node.indent({ command: CommandKey.add, connectionKey: newKey })

    }

    private getKeyByNode(connectionNode: Node): string {
        const dbType = connectionNode.dbType;
        if (dbType == DatabaseType.ES || dbType == DatabaseType.REDIS || dbType == DatabaseType.SSH || dbType == DatabaseType.FTP || dbType ==  DatabaseType.MONGO_DB) {
            return CacheKey.NOSQL_CONNECTION;
        }
        return CacheKey.ConectionsKey;
    }


    public reload(element?: Node) {
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

        const connetKey = this.connectionKey;
        let globalConnections = this.context.globalState.get<{ [key: string]: Node }>(connetKey, {});
        let workspaceConnections = this.context.workspaceState.get<{ [key: string]: Node }>(connetKey, {});
        
        return Object.keys(workspaceConnections).map(key => this.getNode(workspaceConnections[key], key, false, connetKey)).concat(
            Object.keys(globalConnections).map(key => this.getNode(globalConnections[key], key, true, connetKey))
        )
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
            node = new SSHConnectionNode(key, connectInfo, connectInfo.ssh, connectInfo.name)
        } else if (connectInfo.dbType == DatabaseType.FTP) {
            node = new FTPConnectionNode(key, connectInfo)
        } else {
            node = new ConnectionNode(key, connectInfo)
        }
        node.connectionKey = connectionKey;
        node.provider = this
        node.global = global;
        node.context = node.global ? this.context.globalState : this.context.workspaceState;
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

        const dbIdList: string[] = [];
        const dbIdMap = new Map<string, SchemaNode>();
        const numbers = (await this.getConnectionNodes()).length > 1
        for (const dbNode of DatabaseCache.getDatabaseNodeList()) {
            if (dbNode instanceof UserGroup || dbNode instanceof CatalogNode) { continue }
            const uid = numbers ? dbNode.uid : dbNode.schema
            dbIdList.push(uid)
            dbIdMap.set(uid, dbNode)
        }
        if (dbIdList) {
            vscode.window.showQuickPick(dbIdList).then(async (dbId) => {
                if (dbId) {
                    const dbNode = dbIdMap.get(dbId);
                    ConnectionManager.changeActive(dbNode)
                    vscode.window.showInformationMessage(`Change active schema to ${dbNode.schema} success!`)
                }

            })
        }

    }

}
