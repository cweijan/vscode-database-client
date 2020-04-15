import * as vscode from "vscode";

export interface Node {
    /** identify node type in extension package.json */
    type: string;
    /** identify node type in extension source */
    identify: string;

    getTreeItem(): Promise<vscode.TreeItem> | vscode.TreeItem;

    getChildren(isRresh?: boolean): Promise<Node[]>;
}
