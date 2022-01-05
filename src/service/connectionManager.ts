import * as path from "path";
import * as vscode from "vscode";
import { Global } from "../common/global";
import { Node } from "../model/interface/node";
import { QueryUnit } from "./queryUnit";
import { SSHConfig } from "../model/interface/sshConfig";
import { DatabaseCache } from "./common/databaseCache";
import { NodeUtil } from "../model/nodeUtil";
import { SSHTunnelService } from "./ssh/tunnel/sshTunnelService";
import { DbTreeDataProvider } from "../provider/treeDataProvider";
import { IConnection } from "./connect/connection";
import { DatabaseType } from "@/common/constants";
import { EsConnection } from "./connect/esConnection";
import { MSSqlConnnection } from "./connect/mssqlConnection";
import { ClickHouseConnection } from "./connect/clickHouseConnection";
import { MysqlConnection } from "./connect/mysqlConnection";
import { PostgreSqlConnection } from "./connect/postgreSqlConnection";
import { RedisConnection } from "./connect/redisConnection";
import { FTPConnection } from "./connect/ftpConnection";
import { SqliteConnection } from "./connect/sqliteConnection";
import { Console } from "@/common/Console";
import { MongoConnection } from "./connect/mongoConnection";
import { UnsupportConnection } from "./connect/unsupportConnection";

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

    public static activeNode: Node;
    private static alivedConnection: { [key: string]: ConnectionWrapper } = {};
    private static tunnelService = new SSHTunnelService();

    public static tryGetConnection(): Node {

        return this.getByActiveFile() || this.activeNode;
    }

    public static getActiveConnectByKey(key: string): ConnectionWrapper {
        return this.alivedConnection[key]
    }

    public static removeConnection(uid: string) {

        try {
            const lcp = this.activeNode;
            if (lcp?.getConnectId() == uid) {
                delete this.activeNode
            }
            const activeConnect = this.alivedConnection[uid];
            if (activeConnect) {
                this.end(uid, activeConnect)
            }
            DatabaseCache.clearDatabaseCache(uid)
        } catch (error) {
            Console.log(error)
        }

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
            const key = getRequest.sessionId || connectionNode.getConnectId();
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
                try {
                    connectOption = await this.tunnelService.createTunnel(connectOption)
                } catch (error) {
                    this.alivedConnection[key] = null
                    reject(error);
                }
            }
            const newConnection = this.createConnection(connectOption);
            this.alivedConnection[key] = { connection: newConnection, ssh };
            newConnection.connect(async (err: Error) => {
                if (err) {
                    this.end(key, this.alivedConnection[key])
                    reject(err)
                } else {
                    try {
                        const sql = connectionNode?.dialect?.pingDataBase(connectionNode.schema);
                        if (connectionNode.schema && sql) {
                            await QueryUnit.queryPromise(newConnection, sql, false)
                        }
                    } catch (error) {
                        console.log(err)
                    }

                    resolve(newConnection);
                }
            });

        });

    }

    private static createConnection(node: Node) {
        switch (node.dbType) {
            case DatabaseType.MYSQL:
                return new MysqlConnection(node)
            case DatabaseType.MSSQL:
                return new MSSqlConnnection(node)
            case DatabaseType.PG:
                return new PostgreSqlConnection(node)
            case DatabaseType.SQLITE:
                return new SqliteConnection(node);
            case DatabaseType.ES:
                return new EsConnection(node);
            case DatabaseType.MONGO_DB:
                return new MongoConnection(node);
            case DatabaseType.REDIS:
                return new RedisConnection(node);
            case DatabaseType.FTP:
                return new FTPConnection(node);
            case DatabaseType.CLICKHOUSE:
                return new ClickHouseConnection(node);
        }
        if (node.dbType) {
            return new UnsupportConnection(node)
        }
        return new MysqlConnection(node)
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
                const queryName = path.basename(path.resolve(fileName, '..'))
                const [host, port, database, schema] = queryName
                    .replace(/^.*@@/, '') // new connection id
                    .replace(/#.+$/, '').split('@')
                if (host != null) {
                    const node = NodeUtil.of({ key: queryName.split('@@')[0], host, port: parseInt(port), database, schema });
                    return node.getCache();
                }
            }
        }
        return null;
    }

}
