import * as path from "path";
import * as vscode from "vscode";
import { ModelType, CacheKey } from "../common/Constants";
import { QueryUnit } from "../database/QueryUnit";
import { MySQLTreeDataProvider } from "../provider/MysqlTreeDataProvider";
import { IConnection } from "./Connection";
import { DatabaseNode } from "./DatabaseNode";
import { InfoNode } from "./InfoNode";
import { INode } from "./INode";
import { DatabaseCache } from "../database/DatabaseCache";
import { ConnectionManager } from "../database/ConnectionManager";

export class ConnectionNode implements INode, IConnection {

    identify: string;
    database?: string;
    multipleStatements?: boolean;
    type: string = ModelType.CONNECTION;
    constructor(readonly id: string, readonly host: string, readonly user: string,
        readonly password: string, readonly port: string,
        readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        this.identify = `${this.host}_${this.port}_${this.user}`
        return {
            label: this.identify,
            id:this.host,
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.CONNECTION,
            iconPath: path.join(__filename, "..", "..", "..", "resources", "server.png")
        };
    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {

        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), "SHOW DATABASES")
            .then((databases) => {
                let databaseNodes = DatabaseCache.databaseNodes
                if (databaseNodes && databaseNodes.length > 0 && !isRresh) {
                    return databaseNodes
                }

                databaseNodes = databases.map<DatabaseNode>((database) => {
                    return new DatabaseNode(this.host, this.user, this.password, this.port, database.Database, this.certPath);
                })
                DatabaseCache.initDatabaseNodes(databaseNodes)

                return databaseNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async newQuery() {
        QueryUnit.createSQLTextDocument();

    }

    public createDatabase(sqlTreeProvider: MySQLTreeDataProvider) {
        vscode.window.showInputBox({ placeHolder: 'Input you want to create new database name.' }).then(async inputContent => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `create database ${inputContent} default character set = 'utf8' `).then(() => {
                sqlTreeProvider.refresh()
                DatabaseCache.storeCurrentCache()
                vscode.window.showInformationMessage(`create database ${inputContent} success!`)
            })
        })
    }

    public async deleteConnection(context: vscode.ExtensionContext, mysqlTreeDataProvider: MySQLTreeDataProvider) {
        const connections = context.globalState.get<{ [key: string]: IConnection }>(CacheKey.ConectionsKey);
        delete connections[this.id];
        await context.globalState.update(CacheKey.ConectionsKey, connections);

        mysqlTreeDataProvider.refresh();
    }
}
