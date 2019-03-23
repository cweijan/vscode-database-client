import * as fs from "fs";
import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { AppInsightsClient } from "../common/appInsightsClient";
import { Global } from "../common/global";
import { Utility } from "../common/utility";
import { InfoNode } from "./infoNode";
import { INode } from "./INode";
import { TableNode } from "./tableNode";
import { OutputChannel } from "../common/outputChannel";
import { DatabaseCache } from "../common/DatabaseCache";

export class DatabaseNode implements INode {
    constructor(private readonly host: string, private readonly user: string,
        private readonly password: string, private readonly port: string, private readonly database: string,
        private readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: this.database,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            contextValue: "database",
            iconPath: path.join(__filename, "..", "..", "..", "resources", "database.svg"),
        };
    }

    public async getChildren(isRresh:boolean=false): Promise<INode[]> {
        const connection = Utility.createConnection({
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            database: this.database,
            certPath: this.certPath,
        });

        return Utility.queryPromise<any[]>(connection, `SELECT TABLE_NAME FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${this.database}' LIMIT ${Utility.maxTableCount}`)
            .then((tables) => {
                let tableNodes = DatabaseCache.getTableListOfDatabase(this.database)
                if (tableNodes && tableNodes.length > 1 && !isRresh) {
                    return tableNodes
                }

                tableNodes = tables.map<TableNode>((table) => {
                    let tableNode = new TableNode(this.host, this.user, this.password, this.port, this.database, table.TABLE_NAME, this.certPath)
                    return tableNode;
                })
                DatabaseCache.setTableListOfDatabase(this.database, tableNodes)
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async newQuery() {
        OutputChannel.appendLine("test")
        AppInsightsClient.sendEvent("newQuery", { viewItem: "database" });
        OutputChannel.appendLine("test2")
        Utility.createSQLTextDocument();

        Global.activeConnection = {
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            database: this.database,
            certPath: this.certPath,
        };
    }
}
