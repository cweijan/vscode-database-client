import * as path from "path";
import * as vscode from "vscode";
import { CacheKey, Constants, ModelType } from "../../common/constants";
import { Console } from "../../common/outputChannel";
import { ConnectionManager } from "../../database/ConnectionManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { MySQLTreeDataProvider } from "../../provider/mysqlTreeDataProvider";
import { DatabaseNode } from "./databaseNode";
import { UserGroup } from "./userGroup";
import { InfoNode } from "../other/infoNode";
import { Node } from "../interface/node";
import { FileManager } from "../../common/FileManager";
import { Util } from "../../common/util";
import * as getPort from 'get-port'


export class ConnectionNode extends Node {

    public iconPath: string = path.join(Constants.RES_PATH, "server.png");
    public contextValue: string = ModelType.CONNECTION;
    constructor(readonly id: string, readonly parent: Node) {
        super(id)
        this.init(parent)
        if (parent.usingSSH) {
            this.getPort()
        }
    }

    private async getPort() {
        this.parent.ssh.tunnelPort = await getPort({ port: getPort.makeRange(10567, 11567) })
    }


    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let databaseNodes = DatabaseCache.getDatabaseListOfConnection(this.id);
        if (databaseNodes && !isRresh) {
            return databaseNodes;
        }

        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), "show databases")
            .then((databases) => {
                databaseNodes = databases.filter((db) => this.database == null || db.Database == this.database).map<DatabaseNode>((database) => {
                    return new DatabaseNode(database.Database, this);
                });
                databaseNodes.unshift(new UserGroup("USER", this));
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
            const connections = context.globalState.get<{ [key: string]: Node }>(CacheKey.ConectionsKey);
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
            const key = `${lcp.getConnectId()}`;
            await FileManager.show(`${key}.sql`);
            const dbNameList = DatabaseCache.getDatabaseListOfConnection(key).filter((databaseNode) => !(databaseNode instanceof UserGroup)).map((databaseNode) => databaseNode.name);
            await vscode.window.showQuickPick(dbNameList, { placeHolder: "active database" }).then(async (dbName) => {
                if (dbName) {
                    await ConnectionManager.getConnection({
                        host: lcp.host, port: lcp.port, password: lcp.password,
                        user: lcp.user, database: dbName, certPath: null,
                    } as Node, true);
                }
            });
        }
    }

}
