import * as fs from "fs";
import * as getPort from 'get-port'
import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { Global } from "../common/global";
import { Console } from "../common/outputChannel";
import { Node } from "../model/interface/node";
import { QueryUnit } from "./queryUnit";
import tunnel = require('tunnel-ssh')
import { SSHConfig } from "../model/interface/sshConfig";
import { DatabaseCache } from "./common/databaseCache";
import { NodeUtil } from "../model/nodeUtil";
import { SSHTunnelService } from "./common/sshTunnelService";

interface ActiveConnection {
    connection: mysql.Connection;
    ssh: SSHConfig
}

export class ConnectionManager {

    private static lastConnectionNode: Node;
    private static activeConnection: { [key: string]: ActiveConnection } = {};
    private static tunnelService = new SSHTunnelService();

    public static getLastConnectionOption() {
        return this.lastConnectionNode;
    }

    public static getActiveConnectByKey(key: string): ActiveConnection {
        return this.activeConnection[key]
    }

    public static removeConnection(id: string) {

        const lcp = this.lastConnectionNode;
        if (lcp && lcp.getConnectId() == id) {
            delete this.lastConnectionNode
        }
        const activeConnect = this.activeConnection[id];
        if (activeConnect) {
            this.activeConnection[id] = null
            this.tunnelService.closeTunnel(lcp.getConnectId())
            activeConnect.connection.end()
        }
        DatabaseCache.clearDatabaseCache(id)

    }

    public static getLastActiveConnection(): Promise<mysql.Connection> {

        if (!this.activeConnection) {
            return undefined;
        }

        if (vscode.window.activeTextEditor) {
            const fileName = vscode.window.activeTextEditor.document.fileName;
            if (fileName.includes('cweijan.vscode-mysql-client')) {

                const queryName = path.basename(fileName, path.extname(fileName))
                const filePattern = queryName.split('_');
                const [host, port, user] = filePattern
                let database: string;
                if (filePattern.length >= 4) {
                    database = filePattern[3]
                    if (filePattern.length >= 4) {
                        for (let index = 4; index < filePattern.length; index++) {
                            database = `${database}_${filePattern[index]}`
                        }
                    }
                }

                if (host != null && port != null && user != null) {
                    // TODO lost infomation
                    return this.getConnection({ host, port: parseInt(port), user, database } as Node, database != null)
                }
            }
        }

        return this.getConnection(this.lastConnectionNode);

    }

    public static getConnection(connectionNode: Node, changeActive: boolean = false): Promise<mysql.Connection> {
        return new Promise(async (resolve, reject) => {
            NodeUtil.build(connectionNode)
            if (changeActive) {
                this.lastConnectionNode = connectionNode;
                Global.updateStatusBarItems(connectionNode);
            }
            const key = connectionNode.getConnectId();
            const connection = this.activeConnection[key];
            const ssh = connectionNode.ssh;
            if (connection && connection.connection.state == 'authenticated') {
                if (connectionNode.database) {
                    try {
                        await QueryUnit.queryPromise(connection.connection, `use \`${connectionNode.database}\``)
                    } catch (err) {
                        this.activeConnection[key] = null
                        reject(err);
                    }
                }
                resolve(connection.connection);
            } else {
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
                this.activeConnection[key] = { connection: this.createConnection(connectOption), ssh };
                this.activeConnection[key].connection.connect((err: Error) => {
                    if (!err) {
                        this.lastConnectionNode = connectionNode;
                        resolve(this.activeConnection[key].connection);
                    } else {
                        this.activeConnection[key] = null;
                        Console.log(`${err.stack}\n${err.message}`);
                        reject(err.message);
                    }
                });
            }

        });

    }

    public static createConnection(connectionOptions: Node): mysql.Connection {

        const newConnectionOptions = { ...connectionOptions, useConnectionPooling: true, multipleStatements: true } as any as mysql.ConnectionConfig;
        if (connectionOptions.certPath && fs.existsSync(connectionOptions.certPath)) {
            newConnectionOptions.ssl = {
                ca: fs.readFileSync(connectionOptions.certPath),
            };
        }
        return mysql.createConnection(newConnectionOptions);

    }

}