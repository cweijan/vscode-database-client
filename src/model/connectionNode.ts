import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { Utility } from "../common/utility";
import { DatabaseNode } from "./databaseNode";
import { InfoNode } from "./infoNode";
import { INode } from "./INode";

export class ConnectionNode implements INode {
    constructor(private readonly host: string, private readonly user: string, private readonly password: string, private readonly port: number) {
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: this.host,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            contextValue: "connection",
        };
    }

    public async getChildren(): Promise<INode[]> {
        const connection = mysql.createConnection({
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
        });
        return Utility.queryPromise<any[]>(connection, "SHOW DATABASES")
            .then((databases) => {
                return databases.map<DatabaseNode>((database) => {
                    return new DatabaseNode(this.host, this.user, this.password, this.port, database.Database);
                });
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }
}
