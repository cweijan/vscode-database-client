import * as fs from "fs";
import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { Global } from "../common/Global";
import { Console } from "../common/OutputChannel";
import { ConnectionInfo } from "../model/interface/connection";
import { QueryUnit } from "./QueryUnit";
import tunnel = require('tunnel-ssh')

export class ConnectionManager {

    private static lastConnectionOption: ConnectionInfo;
    private static activeConnection: { [key: string]: mysql.Connection } = {};

    public static getLastConnectionOption() {
        return this.lastConnectionOption;
    }

    public static removeConnection(id: string) {

        const lcp = this.lastConnectionOption;
        const key = `${lcp.host}_${lcp.port}_${lcp.user}`;
        if (key == id) {
            delete this.lastConnectionOption
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
                const [host, port, user, database] = queryName.split('_')
                if (host != null && port != null && user != null) {
                    return this.getConnection({
                        multipleStatements: true, host, port, user, database, certPath: null
                    }, database != null)
                }
            }
        }

        return this.getConnection(Object.assign({ multipleStatements: true }, this.lastConnectionOption));

    }

    public static getConnection(connectionOptions: ConnectionInfo, changeActive: boolean = false): Promise<mysql.Connection> {

        connectionOptions.multipleStatements = true;
        if (changeActive) {
            this.lastConnectionOption = connectionOptions;
            Global.updateStatusBarItems(connectionOptions);
        }
        const key = `${connectionOptions.host}_${connectionOptions.port}_${connectionOptions.user}`;

        return new Promise(async (resolve, reject) => {
            const connection = this.activeConnection[key];
            if (connection && connection.state == 'authenticated') {
                if (connectionOptions.database) {
                    QueryUnit.queryPromise(connection, `use \`${connectionOptions.database}\``).then(() => {
                        resolve(connection);
                    }).catch((error) => {
                        reject(error);
                    });
                } else {
                    resolve(connection);
                }
            } else {
                if (connectionOptions.usingSSH) {
                    const port = await this.createTunnel(connectionOptions, (err) => {
                        this.activeConnection[key] = null
                    })
                    if (!port) {
                        throw new Error("create tunnel fail!");
                    } else {
                        connectionOptions = Object.assign({ ...connectionOptions }, { port })
                    }
                }
                this.activeConnection[key] = this.createConnection(connectionOptions);
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


    private static createTunnel(connectionOptions: ConnectionInfo, errorCallback: (error) => void): Promise<number> {
        return new Promise((resolve) => {
            const ssh = connectionOptions.ssh
            const port = 10567;
            const config = {
                username: ssh.username,
                password: ssh.password,
                host: ssh.host,
                port: ssh.port,
                dstHost: connectionOptions.host,
                dstPort: connectionOptions.port,
                localHost: '127.0.0.1',
                localPort: port
            };
            const server = tunnel(config, (error, server) => {
                if (error && errorCallback) { errorCallback(error) }
                resolve(port)
            });
            server.on('error', (err) => {
                Console.log('Bind local tunel occur eror : ' + err);
                resolve(0)
            });
        })
    }

    public static createConnection(connectionOptions: ConnectionInfo): mysql.Connection {
        const newConnectionOptions: any = Object.assign({ useConnectionPooling: true }, connectionOptions);
        if (connectionOptions.certPath && fs.existsSync(connectionOptions.certPath)) {
            newConnectionOptions.ssl = {
                ca: fs.readFileSync(connectionOptions.certPath),
            };
        }

        this.lastConnectionOption = newConnectionOptions;
        return mysql.createConnection(newConnectionOptions);

    }



}