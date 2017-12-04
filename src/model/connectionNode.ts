import * as fs from "fs";
import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { AppInsightsClient } from "../common/appInsightsClient";
import { Constants } from "../common/constants";
import { Global } from "../common/global";
import { Utility } from "../common/utility";
import { MySQLTreeDataProvider } from "../mysqlTreeDataProvider";
import { IConnection } from "./connection";
import { DatabaseNode } from "./databaseNode";
import { InfoNode } from "./infoNode";
import { INode } from "./INode";

export class ConnectionNode implements INode {
    constructor(private readonly id: string, private readonly host: string, private readonly user: string,
                private readonly password: string, private readonly port: string,
                private readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: this.host,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            contextValue: "connection",
            iconPath: path.join(__filename, "..", "..", "..", "resources", "server.png"),
        };
    }

    public async getChildren(): Promise<INode[]> {
        const connection = Utility.createConnection({
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            certPath: this.certPath,
        });

        return Utility.queryPromise<any[]>(connection, "SHOW DATABASES")
            .then((databases) => {
                return databases.map<DatabaseNode>((database) => {
                    return new DatabaseNode(this.host, this.user, this.password, this.port, database.Database, this.certPath);
                });
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async newQuery() {
        AppInsightsClient.sendEvent("newQuery", { viewItem: "connection" });
        Utility.createSQLTextDocument();

        Global.activeConnection = {
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            certPath: this.certPath,
        };
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
