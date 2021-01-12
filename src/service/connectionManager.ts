import * as path from "path";
import * as vscode from "vscode";
import { Global } from "../common/global";
import { Node } from "../model/interface/node";
import { QueryUnit } from "./queryUnit";
import { SSHConfig } from "../model/interface/sshConfig";
import { DatabaseCache } from "./common/databaseCache";
import { NodeUtil } from "../model/nodeUtil";
import { SSHTunnelService } from "./common/sshTunnelService";
import { DbTreeDataProvider } from "../provider/treeDataProvider";
import { create, IConnection } from "./connect/connection";
import { MysqlConnection } from "./connect/mysqlConnection";

interface ConnectionWrapper {
    connection: IConnection;
    ssh: SSHConfig;
    createTime: Date
}

export class ConnectionManager {

    private static lastConnectionNode: Node;
    private static activeConnection: { [key: string]: ConnectionWrapper } = {};
    private static tunnelService = new SSHTunnelService();

    public static getLastConnectionOption(checkActiveFile = true): Node {

        if (checkActiveFile) {
            const fileNode = this.getByActiveFile()
            if (fileNode) { return fileNode }
        }

        const node = this.lastConnectionNode;
        if (node == null) {
            // ConnectionManager.checkConnection();
        }

        return node;
    }

    public static getActiveConnectByKey(key: string): ConnectionWrapper {
        return this.activeConnection[key]
    }

    public static removeConnection(uid: string) {

        const lcp = this.lastConnectionNode;
        if (lcp && lcp.getConnectId() == uid) {
            delete this.lastConnectionNode
        }
        const activeConnect = this.activeConnection[uid];
        if (activeConnect) {
            this.activeConnection[uid] = null
            this.tunnelService.closeTunnel(uid)
            activeConnect.connection.end()
        }
        DatabaseCache.clearDatabaseCache(uid)

    }

    public static getConnection(connectionNode: Node, changeActive: boolean = false): Promise<IConnection> {
        if (!connectionNode) {
            this.checkConnection()
            throw new Error("No MySQL Server or Database selected!")
        }
        return new Promise(async (resolve, reject) => {

            NodeUtil.of(connectionNode)
            if (changeActive) {
                this.lastConnectionNode = connectionNode;
                Global.updateStatusBarItems(connectionNode);
                setTimeout(() => {
                    // TODO, 这里导致缓存失效
                    DbTreeDataProvider.refresh()
                }, 100);
            }
            const key = connectionNode.getConnectId({ withDb: true });
            const connection = this.activeConnection[key];
            if (connection ) {
                if(connection.connection.isAlive()){
                    const sql = connectionNode.dialect.pingDataBase(connectionNode.database);
                    try {
                        if(sql){
                            await QueryUnit.queryPromise(connection.connection, sql, false)
                        }
                        resolve(connection.connection);
                        return;
                    } catch (err) {
                        ConnectionManager.end(key, connection);
                    }
                }
            }

            const ssh = connectionNode.ssh;
            let connectOption = connectionNode;
            if (connectOption.usingSSH) {
                connectOption = await this.tunnelService.createTunnel(connectOption, (err) => {
                    if (err.errno == 'EADDRINUSE') { return; }
                    this.activeConnection[key] = null
                })
                if (!connectOption) {
                    reject("create ssh tunnel fail!");
                    return;
                }
            }
            const newConnection = create(connectOption);
            this.activeConnection[key] = { connection: newConnection, ssh, createTime: new Date() };
            newConnection.connect(async (err: Error) => {
                if (err) {
                    this.end(key,this.activeConnection[key])
                    resolve(await this.getConnection(connectionNode,changeActive))
                } else {
                    if (changeActive) {
                        this.lastConnectionNode = NodeUtil.of(connectionNode);
                    }
                    resolve(newConnection);
                }
            });

        });

    }

    private static end(key: string, connection: ConnectionWrapper) {
        this.activeConnection[key] = null
        try {
            this.tunnelService.closeTunnel(key)
            connection.connection.end();
        } catch (error) {
        }
    }

    public static getByActiveFile(): Node {
        if (vscode.window.activeTextEditor) {
            const fileName = vscode.window.activeTextEditor.document.fileName;
            if (fileName.includes('cweijan.vscode-mysql-client2')) {
                const queryName = path.basename(fileName, path.extname(fileName))
                const filePattern = queryName.replace(/#.+$/, '').split('_');
                const [mode, host, port, user] = filePattern
                let database: string;
                if (filePattern.length >= 5) {
                    database = filePattern[4]
                    // fix if database name has _, loop append
                    if (filePattern.length >= 5) {
                        for (let index = 5; index < filePattern.length; index++) {
                            database = `${database}_${filePattern[index]}`
                        }
                    }
                }
                if (host != null && port != null && user != null) {
                    const node = NodeUtil.of({ host, port: parseInt(port), user, database });
                    if (node.getCache()) {
                        return node.getCache();
                    }
                }
            }
        }
        return null;
    }

    private static checkConnection() {
        vscode.window.showErrorMessage("Please create database connection.", "Config").then(action => {
            if (action == "Config") {
                vscode.commands.executeCommand('mysql.connection.add');
            }
        });
    }


}
