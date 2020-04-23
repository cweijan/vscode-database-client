import * as path from "path";
import * as vscode from "vscode";
import { CacheKey, Constants, ModelType } from "../common/Constants";
import { Console } from "../common/OutputChannel";
import { ConnectionManager } from "../database/ConnectionManager";
import { DatabaseCache } from "../database/DatabaseCache";
import { QueryUnit } from "../database/QueryUnit";
import { MySQLTreeDataProvider } from "../provider/MysqlTreeDataProvider";
import { ConnectionInfo } from "./interface/connection";
import { DatabaseNode } from "./database/databaseNode";
import { UserGroup } from "./database/userGroup";
import { InfoNode } from "./InfoNode";
import { Node } from "./interface/node";
import { FileManager } from "../extension/FileManager";
import { Util } from "../common/util";


export class ConnectionNode implements Node, ConnectionInfo {

    public multipleStatements?: boolean;
    public type: string = ModelType.CONNECTION;
    constructor(readonly id: string, readonly host: string, readonly user: string,
        readonly password: string, readonly port: string,
        public readonly database: string,
        readonly certPath: string) {
        
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: this.id,
            id: this.id,
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.CONNECTION,
            iconPath: path.join(Constants.RES_PATH, "server.png"),
        };
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        let databaseNodes = DatabaseCache.getDatabaseListOfConnection(this.id);
        if (databaseNodes && !isRresh) {
            return databaseNodes;
        }

        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), "show databases")
            .then((databases) => {
                databaseNodes = databases.filter(db => this.database == null || db.Database == this.database).map<DatabaseNode>((database) => {
                    return new DatabaseNode(this.host, this.user, this.password, this.port, database.Database, this.certPath);
                });
                databaseNodes.unshift(new UserGroup(this.host, this.user, this.password, this.port, 'mysql', this.certPath));
                DatabaseCache.setDataBaseListOfConnection(this.id, databaseNodes);

                return databaseNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async newQuery() {
        ConnectionManager.getConnection(this);
        ConnectionNode.tryOpenQuery()
    }

    public createDatabase() {
        vscode.window.showInputBox({ placeHolder: 'Input you want to create new database name.' }).then(async (inputContent) => {
            if (!inputContent) { return; }
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `create database \`${inputContent}\` default character set = 'utf8' `).then(() => {
                DatabaseCache.clearDatabaseCache(this.id);
                MySQLTreeDataProvider.refresh();
                vscode.window.showInformationMessage(`create database ${inputContent} success!`);
            });
        });
    }

    public async deleteConnection(context: vscode.ExtensionContext) {

        Util.confirm(`Are you want to Delete Connection ${this.id} ? `, async () => {
            const connections = context.globalState.get<{ [key: string]: ConnectionInfo }>(CacheKey.ConectionsKey);
            ConnectionManager.removeConnection(this.id)
            DatabaseCache.clearDatabaseCache(this.id)
            delete connections[this.id];
            await context.globalState.update(CacheKey.ConectionsKey, connections);
            MySQLTreeDataProvider.refresh();
        })

    }

    public importData(fsPath: string) {
        Console.log(`Doing import ${this.host}:${this.port}...`);
        ConnectionManager.getConnection(this).then((connection) => {
            QueryUnit.runFile(connection, fsPath);
        });
    }

    public static async tryOpenQuery() {
        const lcp = ConnectionManager.getLastConnectionOption();
        if (!lcp) {
            Console.log("Not active connection found!");
        } else {
            const key = `${lcp.host}_${lcp.port}_${lcp.user}`;
            await FileManager.show(`${key}.sql`);
            const dbNameList = DatabaseCache.getDatabaseListOfConnection(key).filter((databaseNode) => !(databaseNode instanceof UserGroup)).map((databaseNode) => databaseNode.database);
            await vscode.window.showQuickPick(dbNameList, { placeHolder: "active database" }).then(async (dbName) => {
                if (dbName) {
                    await ConnectionManager.getConnection({
                        host: lcp.host, port: lcp.port, password: lcp.password,
                        user: lcp.user, database: dbName, certPath: null,
                    }, true);
                }
            });
        }
    }

}
