import * as path from "path";
import * as vscode from "vscode";
import { AppInsightsClient } from "../common/appInsightsClient";
import { Constants, ModelType } from "../common/constants";
import { Global } from "../common/global";
import { Utility } from "../common/utility";
import { MySQLTreeDataProvider } from "../provider/mysqlTreeDataProvider";
import { IConnection } from "./connection";
import { DatabaseNode } from "./databaseNode";
import { InfoNode } from "./infoNode";
import { INode } from "./INode";
import { DatabaseCache } from "../common/DatabaseCache";
import { OutputChannel } from "../common/outputChannel";

export class ConnectionNode implements INode {
    identify: string;
    type: string = ModelType.CONNECTION;
    constructor(private readonly id: string, readonly host: string, private readonly user: string,
        private readonly password: string, readonly port: string,
        private readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        this.identify=`${this.host}_${this.port}_${this.user}`
        return {
            label: this.host,
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: "connection",
            iconPath: path.join(__filename, "..", "..", "..", "resources", "server.png"),
        };
    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {
        const connection = Utility.createConnection({
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            certPath: this.certPath,
        });

        return Utility.queryPromise<any[]>(connection, "SHOW DATABASES")
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
