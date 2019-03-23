import * as vscode from "vscode";
import { INode } from "./INode";

export class InfoNode implements INode {
    constructor(private readonly label: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
        };
    }

    public async getChildren(): Promise<INode[]>{
        return [];
    }
}
