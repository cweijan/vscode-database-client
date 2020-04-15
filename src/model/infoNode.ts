import * as vscode from "vscode";
import { Node } from "./interface/node";
import { ModelType } from "../common/Constants";

export class InfoNode implements Node {
    identify: string;
    type: string=ModelType.INFO;
    constructor(private readonly label: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
        };
    }

    public async getChildren(): Promise<Node[]>{
        return [];
    }
}
