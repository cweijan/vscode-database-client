import * as path from "path";
import * as vscode from "vscode";
import { AppInsightsClient } from "../common/appInsightsClient";
import { Constants, ModelType } from "../common/Constants";
import { Global } from "../common/Global";
import { QueryUnit } from "../database/QueryUnit";
import { MySQLTreeDataProvider } from "../provider/mysqlTreeDataProvider";
import { IConnection } from "./connection";
import { DatabaseNode } from "./databaseNode";
import { InfoNode } from "./infoNode";
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
            label: this.host,
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: "connection",
            iconPath: path.join(__filename, "..", "..", "..", "resources", "server.png")
        };
    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {

        return QueryUnit.queryPromise<any[]>(ConnectionManager.getConnection(this), "SHOW DATABASES")
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
        AppInsightsClient.sendEvent("newQuery", { viewItem: "connection" });
        QueryUnit.createSQLTextDocument();

    }

    public createDatabase() {
        vscode.window.showInputBox({ placeHolder: 'Input you want to create new database name.' }).then(inputContent => {
            QueryUnit.queryPromise(ConnectionManager.getConnection(this), `create database ${inputContent} default character set = 'utf8' `).then(() => {
                Global.sqlTreeProvider.refresh()
                DatabaseCache.storeCurrentCache()
                vscode.window.showInformationMessage(`create database ${inputContent} success!`)
            })
        })
    }

    public async deleteConnection(context: vscode.ExtensionContext, mysqlTreeDataProvider: MySQLTreeDataProvider) {
        AppInsightsClient.sendEvent("deleteConnection");
        const connections = context.globalState.get<{ [key: string]: IConnection }>(Constants.GlobalStateMySQLConectionsKey);
        delete connections[this.id];
        await context.globalState.update(Constants.GlobalStateMySQLConectionsKey, connections);

        await Global.keytar.deletePassword(Constants.ExtensionId, this.id);

        mysqlTreeDataProvider.refresh();
    }
}
