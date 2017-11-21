import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { Global } from "../common/global";
import { OutputChannel } from "../common/outputChannel";
import { Utility } from "../common/utility";
import { INode } from "./INode";

export class TableNode implements INode {
    constructor(private readonly host: string, private readonly user: string, private readonly password: string, private readonly database: string, private readonly table: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: this.table,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            contextValue: "table",
        };
    }

    public async getChildren(): Promise<INode[]> {
        return [];
    }

    public async selectTop1000() {
        const sql = `SELECT * FROM ${this.database}.${this.table};`;
        const textDocument = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
        vscode.window.showTextDocument(textDocument);

        const connection = mysql.createConnection({
            host: this.host,
            user: this.user,
            password: this.password,
            database: this.database,
        });
        // TODO
        Global.activeConnection = {
            host: this.host,
            user: this.user,
            password: this.password,
            database: this.database,
        };
        Utility.queryPromise<any[]>(connection, sql)
            .then((result) => {
                OutputChannel.appendLine(JSON.stringify(result, null, 2));
            })
            .catch((err) => {
                vscode.window.showErrorMessage(err);
            });
    }
}
