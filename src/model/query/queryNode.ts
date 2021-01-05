import * as vscode from "vscode";
import { ModelType, Constants } from "@/common/constants";
import { FileManager } from "@/common/filesManager";
import { QueryUnit } from "@/service/queryUnit";
import { readFileSync, renameSync } from "fs";
import * as path from "path";
import { TreeItemCollapsibleState, window } from "vscode";
import { Node } from "../interface/node";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";

export class QueryNode extends Node {
    public contextValue = ModelType.QUERY;
    public iconPath = path.join(Constants.RES_PATH, "icon/select.svg")
    constructor(public name: string, readonly parent: Node) {
        super(name)
        this.init(parent)
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

    public async rename() {
        vscode.window.showInputBox({ placeHolder: "Input new name" }).then(newName => {
            if (newName) {
                renameSync(this.getFilePath(),this.getFilePath(newName))
                DbTreeDataProvider.refresh(this.parent)
            }
        })
    }

    private getFilePath(newName?: string): string {
        return `${FileManager.storagePath}/query/${this.dbType}_${this.getConnectId()}_${this.database}/${newName || this.name}.sql`;
    }


}