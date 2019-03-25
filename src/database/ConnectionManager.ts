import * as fs from "fs";
import * as mysql from "mysql";
import { IConnection } from "../model/connection";
import { Constants } from "../common/Constants";
import { OutputChannel } from "../common/outputChannel";
import { Global } from "../common/Global";

export class ConnectionManager {

    private static connectionMap = {}
    private static lastConnectionOption: IConnection;
    private static lastActiveConnection:any;

    public static updateLastActiveConnection(connectionOptions: IConnection): any {
        this.lastConnectionOption = connectionOptions
    }

    public static getLastActiveConnection() {

        if (!this.lastConnectionOption) {
            return undefined;
        }

        if(this.lastActiveConnection&&((new Date().getTime() - this.lastActiveConnection.expireTime) < Constants.EXPIRE_TIME)){
            return this.lastActiveConnection
        }

        return this.createConnection(Object.assign({ multipleStatements: true }, this.lastConnectionOption))

    }

    public static getConnection(connectionOptions: IConnection) {

        if(!connectionOptions.multipleStatements)connectionOptions.multipleStatements=true

        const key = `${connectionOptions.host}_${connectionOptions.port}_${connectionOptions.user}_${connectionOptions.database}`
        
        if (this.connectionMap[key] &&
            ((new Date().getTime() - this.connectionMap[key].expireTime) > Constants.EXPIRE_TIME)
            ) {
                this.connectionMap[key].conneciton.end()
                this.connectionMap[key] = undefined
            }
            
            if (!this.connectionMap[key]) {
                OutputChannel.appendLine("create new " + key);
                this.connectionMap[key] = {
                    conneciton: this.createConnection(connectionOptions),
                    expireTime: new Date()
                };
                
            }
            
            Global.updateStatusBarItems(connectionOptions);
            
            return this.lastActiveConnection=this.connectionMap[key].conneciton
        }


    public static createConnection(connectionOptions: IConnection): any {
        const newConnectionOptions: any = Object.assign({useConnectionPooling:true}, connectionOptions);
        if (connectionOptions.certPath && fs.existsSync(connectionOptions.certPath)) {
            newConnectionOptions.ssl = {
                ca: fs.readFileSync(connectionOptions.certPath),
            };
        }
        
        this.lastConnectionOption = newConnectionOptions;
        return mysql.createConnection(newConnectionOptions);

    }

}