import * as vscode from "vscode";

export interface INode {
    /** identify node type in extension package.json */
    type: string
    /** identify node type in extension source */
    identify: string

    getTreeItem(): Promise<vscode.TreeItem> | vscode.TreeItem;

    getChildren(isRresh?: boolean): Promise<INode[]>;
}
