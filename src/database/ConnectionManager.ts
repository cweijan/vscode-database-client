import * as fs from "fs";
import * as mysql from "mysql";
import { IConnection } from "../model/Connection";
import { Constants } from "../common/Constants";
import { Console } from "../common/OutputChannel";
import { Global } from "../common/Global";

export class ConnectionManager {

    private static connectionCache = {}
    private static lastConnectionOption: IConnection;
    private static lastActiveConnection: any;

    public static updateLastActiveConnection(connectionOptions: IConnection): any {
        this.lastConnectionOption = connectionOptions
    }

    public static getLastActiveConnection() {

        if (!this.lastConnectionOption) {
            return undefined;
        }

        if (this.lastActiveConnection && this.lastActiveConnection.state == 'authenticated') {
            return this.lastActiveConnection
        }

        return this.getConnection(Object.assign({ multipleStatements: true }, this.lastConnectionOption))

    }

    public static getConnection(connectionOptions: IConnection): Promise<any> {

        if (!connectionOptions.multipleStatements) connectionOptions.multipleStatements = true

        const key = `${connectionOptions.host}_${connectionOptions.port}_${connectionOptions.user}_${connectionOptions.password}_${connectionOptions.database}`

        let useCache = false

        if (!this.connectionCache[key] ||
            (this.connectionCache[key] && this.connectionCache[key].conneciton.state != 'authenticated')) {

            this.connectionCache[key] = {
                connectionOptions: connectionOptions,
                conneciton: this.createConnection(connectionOptions)
            };
        } else {
            useCache = true;
        }

        return new Promise((resolve, reject) => {
            if (useCache) {
                this.lastConnectionOption = this.connectionCache[key].connectionOptions
                this.lastActiveConnection = this.connectionCache[key].conneciton
                Global.updateStatusBarItems(this.lastConnectionOption);
                resolve(this.connectionCache[key].conneciton)
                return;
            }
            this.connectionCache[key].conneciton.connect((err: Error) => {
                if (!err) {
                    this.lastConnectionOption = connectionOptions
                    this.lastActiveConnection = this.connectionCache[key].conneciton
                    Global.updateStatusBarItems(this.lastConnectionOption);
                    resolve(this.lastActiveConnection);
                } else {
                    this.connectionCache[key] = undefined
                    Console.log(`${err.stack}\n${err.message}`)
                    reject(err.message);
                }
            });
        });

    }


    public static createConnection(connectionOptions: IConnection): any {
        const newConnectionOptions: any = Object.assign({ useConnectionPooling: true, connectTimeout: Constants.EXPIRE_TIME }, connectionOptions);
        if (connectionOptions.certPath && fs.existsSync(connectionOptions.certPath)) {
            newConnectionOptions.ssl = {
                ca: fs.readFileSync(connectionOptions.certPath),
            };
        }

        this.lastConnectionOption = newConnectionOptions;
        return mysql.createConnection(newConnectionOptions);

    }

}