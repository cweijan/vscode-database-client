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
import { IConnection } from "./connect/connection";
import { DatabaseType } from "@/common/constants";
import { EsConnection } from "./connect/esConnection";
import { MSSqlConnnection } from "./connect/mssqlConnection";
import { MysqlConnection } from "./connect/mysqlConnection";
import { PostgreSqlConnection } from "./connect/postgreSqlConnection";
import { RedisConnection } from "./connect/redisConnection";

interface ConnectionWrapper {
    connection: IConnection;
    ssh: SSHConfig;
    schema?: string
}

export interface GetRequest {
    retryCount?: number;
    sessionId?: string;
}

export class ConnectionManager {

    private static activeNode: Node;
    private static alivedConnection: { [key: string]: ConnectionWrapper } = {};
    private static tunnelService = new SSHTunnelService();

    public static getLastConnectionOption(checkActiveFile = true): Node {

        if (checkActiveFile) {
            const fileNode = this.getByActiveFile()
            if (fileNode) { return fileNode }
        }

        const node = this.activeNode;
        if (!node && checkActiveFile) {
            vscode.window.showErrorMessage("Not active database connection found!")
            throw new Error("Not active database connection found!")
        }

        return node;
    }

    public static getActiveConnectByKey(key: string): ConnectionWrapper {
        return this.alivedConnection[key]
    }

    public static removeConnection(uid: string) {

        const lcp = this.activeNode;
        if (lcp?.getConnectId() == uid) {
            delete this.activeNode
        }
        const activeConnect = this.alivedConnection[uid];
        if (activeConnect) {
            this.end(uid, activeConnect)
        }
        DatabaseCache.clearDatabaseCache(uid)

    }

    public static changeActive(connectionNode: Node) {
        this.activeNode = connectionNode;
        Global.updateStatusBarItems(connectionNode);
        DbTreeDataProvider.refresh()
    }

    public static getConnection(connectionNode: Node, getRequest: GetRequest = { retryCount: 1 }): Promise<IConnection> {
        if (!connectionNode) {
            throw new Error("Connection is dead!")
        }
        return new Promise(async (resolve, reject) => {

            NodeUtil.of(connectionNode)
            if (!getRequest.retryCount) getRequest.retryCount = 1;
            const key = getRequest.sessionId || connectionNode.getConnectId({ withDb: true });
            const connection = this.alivedConnection[key];
            if (connection) {
                if (connection.connection.isAlive()) {
                    if (connection.schema != connectionNode.schema) {
                        const sql = connectionNode?.dialect?.pingDataBase(connectionNode.schema);
                        try {
                            if (sql) {
                                await QueryUnit.queryPromise(connection.connection, sql, false)
                            }
                            connection.schema = connectionNode.schema
                            resolve(connection.connection);
                            return;
                        } catch (err) {
                            ConnectionManager.end(key, connection);
                        }
                    } else {
                        resolve(connection.connection);
                        return;
                    }
                }
            }

            const ssh = connectionNode.ssh;
            let connectOption = connectionNode;
            if (connectOption.usingSSH) {
                connectOption = await this.tunnelService.createTunnel(connectOption, (err) => {
                    if (err.errno == 'EADDRINUSE') { return; }
                    this.alivedConnection[key] = null
                })
                if (!connectOption) {
                    reject("create ssh tunnel fail!");
                    return;
                }
            }
            const newConnection = this.create(connectOption);
            this.alivedConnection[key] = { connection: newConnection, ssh, schema: connectionNode.schema };
            newConnection.connect(async (err: Error) => {
                if (err) {
                    this.end(key, this.alivedConnection[key])
                    if (getRequest.retryCount >= 2) {
                        reject(err)
                    } else {
                        try {
                            getRequest.retryCount++;
                            resolve(await this.getConnection(connectionNode, getRequest))
                        } catch (error) {
                            reject(error)
                        }
                    }
                } else {
                    resolve(newConnection);
                }
            });

        });

    }

    private static create(opt: Node) {
        switch (opt.dbType) {
            case DatabaseType.MSSQL:
                return new MSSqlConnnection(opt)
            case DatabaseType.PG:
                return new PostgreSqlConnection(opt)
            case DatabaseType.ES:
                return new EsConnection(opt);
            case DatabaseType.REDIS:
                return new RedisConnection(opt);
        }
        return new MysqlConnection(opt)
    }

    private static end(key: string, connection: ConnectionWrapper) {
        this.alivedConnection[key] = null
        try {
            this.tunnelService.closeTunnel(key)
            connection.connection.end();
        } catch (error) {
        }
    }

    public static getByActiveFile(): Node {
        if (vscode.window.activeTextEditor) {
            const fileName = vscode.window.activeTextEditor.document.fileName;
            if (fileName.includes('cweijan')) {
                const queryName = path.basename(fileName, path.extname(fileName))
                const filePattern = queryName.replace(/#.+$/, '').split('_');
                const [mode, host, port, user] = filePattern
                let schema: string;
                if (filePattern.length >= 5) {
                    schema = filePattern[4]
                    // fix if schema name has _, loop append
                    if (filePattern.length >= 5) {
                        for (let index = 5; index < filePattern.length; index++) {
                            schema = `${schema}_${filePattern[index]}`
                        }
                    }
                }
                if (host != null && port != null && user != null) {
                    const node = NodeUtil.of({ host, port: parseInt(port), user, schema });
                    if (node.getCache()) {
                        return node.getCache();
                    }
                }
            }
        }
        return null;
    }

}
