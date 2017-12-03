import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { AppInsightsClient } from "../common/appInsightsClient";
import { Global } from "../common/global";
import { OutputChannel } from "../common/outputChannel";
import { Utility } from "../common/utility";
import { InfoNode } from "./infoNode";
import { INode } from "./INode";

export class ColumnNode implements INode {
    constructor(private readonly host: string, private readonly user: string, private readonly password: string,
                private readonly port: string, private readonly database: string, private readonly table: any ) {
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: `${this.table.COLUMN_NAME} : ${this.table.COLUMN_TYPE}     \n${this.table.COLUMN_COMMENT}`,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            contextValue: "column",
            iconPath: path.join(__filename, "..", "..", "..", "resources", this.table.COLUMN_KEY === "PRI" ? "b_primary.png" : "b_props.png"),
        };
    }

    public async getChildren(): Promise<INode[]> {
        return [];
    }
}
