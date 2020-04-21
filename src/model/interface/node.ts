import * as vscode from "vscode";

export interface Node {
    /** id node type in extension package.json */
    type: string;
    /** id node type in extension source */
    id: string;

    getTreeItem(): Promise<vscode.TreeItem> | vscode.TreeItem;

    getChildren(isRresh?: boolean): Promise<Node[]>;
}
