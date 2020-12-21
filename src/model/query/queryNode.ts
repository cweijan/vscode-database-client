import * as vscode from "vscode";
import { ModelType, Constants } from "@/common/constants";
import { FileManager } from "@/common/filesManager";
import { QueryUnit } from "@/service/queryUnit";
import { readFileSync } from "fs";
import * as path from "path";
import { TreeItemCollapsibleState, window } from "vscode";
import { Node } from "../interface/node";

export class QueryNode extends Node {
    public contextValue = ModelType.QUERY;
    public iconPath = path.join(Constants.RES_PATH, "icon/select.svg")
    constructor(public name: string,  readonly info: Node) {
        super(name)
        this.init(info)
        this.collapsibleState = TreeItemCollapsibleState.None
        this.command = {
            command: "mysql.query.open",
            title: "Open Query",
            arguments: [this, true],
        }
    }

    public async open() {
        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(this.getFilePath())
        );
    }

    private getFilePath(): string {
        return `${FileManager.storagePath}/query/${this.getConnectId()}_${this.database}/${this.name}.sql`;
    }


}