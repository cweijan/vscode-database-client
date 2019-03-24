import * as vscode from "vscode";
import { INode } from "./INode";
import { ModelType } from "../common/constants";

export class InfoNode implements INode {
    identify: string;
    type: string=ModelType.INFO;
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
