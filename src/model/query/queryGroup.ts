import * as vscode from "vscode";
import { ModelType, Constants } from "@/common/constants";
import * as path from "path";
import { Node } from "../interface/node";
import { QueryNode } from "./queryNode";
import { FileManager } from "@/common/filesManager";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";

export class QueryGroup extends Node {
    public contextValue = ModelType.QUERY_GROUP;
    public iconPath = path.join(Constants.RES_PATH, "icon/select.svg")
    private storePath: string;
    constructor(readonly parent: Node) {
        super("Query")
        this.init(parent)
        this.storePath = `${FileManager.storagePath}/query/${this.getConnectId()}_${this.database}`;
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        if (!existsSync(this.storePath)) {
            return []
        }
        return readdirSync(this.storePath).map(fileName => new QueryNode(fileName.replace(/\.[^/.]+$/, ""), this))
    }

    public add() {
        if (!existsSync(this.storePath)) {
            mkdirSync(this.storePath,{recursive:true});
        }
        vscode.window.showInputBox({ placeHolder: "queryName" }).then(res => {
            if (res) {
                const sqlPath = `${this.storePath}/${res}.sql`
                writeFileSync(sqlPath, '')
                DbTreeDataProvider.refresh(this)
            }
        })
    }

}