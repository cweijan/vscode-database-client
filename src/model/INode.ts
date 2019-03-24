import * as vscode from "vscode";

export interface INode  {

    type:string 
    identify:string

    getTreeItem(): Promise<vscode.TreeItem> | vscode.TreeItem;

    getChildren(isRresh?:boolean): Promise<INode[]> ;
}
