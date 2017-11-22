import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { Global } from "../common/global";
import { Utility } from "../common/utility";
import { InfoNode } from "./infoNode";
import { INode } from "./INode";
import { TableNode } from "./tableNode";

export class DatabaseNode implements INode {
    constructor(private readonly host: string, private readonly user: string, private readonly password: string, private readonly port: string, private readonly database: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: this.database,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            contextValue: "database",
        };
    }

    public async getChildren(): Promise<INode[]> {
        const connection = mysql.createConnection({
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            database: this.database,
        });
        return Utility.queryPromise<any[]>(connection, `SELECT TABLE_NAME FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${this.database}' LIMIT 100`)
            .then((tables) => {
                return tables.map<TableNode>((table) => {
                    return new TableNode(this.host, this.user, this.password, this.port, this.database, table.TABLE_NAME);
                });
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async newQuery() {
        const textDocument = await vscode.workspace.openTextDocument({ content: "", language: "sql" });
        vscode.window.showTextDocument(textDocument);

        Global.activeConnection = {
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            database: this.database,
        };
    }
}
