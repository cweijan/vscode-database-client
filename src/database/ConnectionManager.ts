import * as fs from "fs";
import * as getPort from 'get-port'
import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { Global } from "../common/Global";
import { Console } from "../common/OutputChannel";
import { Node } from "../model/interface/node";
import { QueryUnit } from "./QueryUnit";
import tunnel = require('tunnel-ssh')

export class ConnectionManager {

    private static lastConnectionNode: Node;
    private static activeConnection: { [key: string]: mysql.Connection } = {};

    public static getLastConnectionOption() {
        return this.lastConnectionNode;
    }

    public static removeConnection(id: string) {

        const lcp = this.lastConnectionNode;
        if (lcp && lcp.getConnectId() == id) {
            delete this.lastConnectionNode
        }
        const activeConnect = this.activeConnection[id];
        if (activeConnect) {
            this.activeConnection[id] = null
            activeConnect.end()
        }

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
                    return this.getConnection({
                        host, port, user, database, getConnectId: () => `${host}_${port}_${user}`
                    } as Node, database != null)
                }
            }
        }

        return this.getConnection(this.lastConnectionNode);

    }

    public static getConnection(connectionNode: Node, changeActive: boolean = false): Promise<mysql.Connection> {
        if (!connectionNode.getConnectId) {
            connectionNode.getConnectId = () => `${connectionNode.host}_${connectionNode.port}_${connectionNode.user}`
        }
        if (changeActive) {
            this.lastConnectionNode = connectionNode;
            Global.updateStatusBarItems(connectionNode);
        }
        const key = `${connectionNode.host}_${connectionNode.port}_${connectionNode.user}`;

        return new Promise(async (resolve, reject) => {

            const connection = this.activeConnection[key];
            if (connection && connection.state == 'authenticated') {
                if (connectionNode.database) {
                    QueryUnit.queryPromise(connection, `use \`${connectionNode.database}\``).then(() => {
                        resolve(connection);
                    }).catch((error) => {
                        this.activeConnection[key] = null
                        reject(error);
                    });
                } else {
                    resolve(connection);
                }
            } else {
                if (connectionNode.usingSSH) {

                    const port = await this.createTunnel(connectionNode, (err) => {
                        if (err.errno == 'EADDRINUSE') { return; }
                        this.activeConnection[key] = null
                    })
                    if (!port) {
                        reject("create ssh tunnel fail!");
                        return;
                    } else {
                        connectionNode = { ...connectionNode.origin, port, getConnectId: connectionNode.getConnectId } as any as Node
                    }
                }
                this.activeConnection[key] = this.createConnection(connectionNode);
                this.activeConnection[key].connect((err: Error) => {
                    if (!err) {
                        resolve(this.activeConnection[key]);
                    } else {
                        this.activeConnection[key] = null;
                        Console.log(`${err.stack}\n${err.message}`);
                        reject(err.message);
                    }
                });
            }

        });

    }

    private static tunelMark: { [key: string]: any } = {};
    private static createTunnel(connectionNode: Node, errorCallback: (error) => void): Promise<number> {
        return new Promise(async (resolve) => {
            const ssh = connectionNode.ssh
            if (!connectionNode.ssh.tunnelPort) {
                connectionNode.ssh.tunnelPort = await getPort({ port: getPort.makeRange(10567, 11567) })
            }
            const port = connectionNode.ssh.tunnelPort;
            const key = `${ssh.username}_${ssh.port}_${ssh.username}`;
            if (this.tunelMark[key]) {
                resolve(port)
            }
            const origin = connectionNode.origin
            const config = {
                username: ssh.username,
                password: ssh.password,
                host: ssh.host,
                port: ssh.port,
                dstHost: origin.host,
                dstPort: origin.port,
                localHost: '127.0.0.1',
                localPort: port
            };
            const localTunnel = tunnel(config, (error, server) => {
                this.tunelMark[key] = server
                if (error && errorCallback) {
                    delete this.tunelMark[key]
                    errorCallback(error)
                }
                resolve(port)
            });
            localTunnel.on('error', (err) => {
                Console.log('Ssh tunel occur eror : ' + err);
                if (err && errorCallback) {
                    localTunnel.close()
                    delete this.tunelMark[key]
                    errorCallback(err)
                }
                resolve(0)
            });
        })
    }

    public static createConnection(connectionOptions: Node): mysql.Connection {

        const newConnectionOptions = { ...connectionOptions, useConnectionPooling: true, multipleStatements: true } as any as mysql.ConnectionConfig;
        if (connectionOptions.certPath && fs.existsSync(connectionOptions.certPath)) {
            newConnectionOptions.ssl = {
                ca: fs.readFileSync(connectionOptions.certPath),
            };
        }

        this.lastConnectionNode = connectionOptions;
        return mysql.createConnection(newConnectionOptions);

    }

}