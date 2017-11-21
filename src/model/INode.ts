import * as vscode from "vscode";

export interface INode {

    getTreeItem(): Promise<vscode.TreeItem> | vscode.TreeItem;

    getChildren(): Promise<INode[]> | INode[];
}
