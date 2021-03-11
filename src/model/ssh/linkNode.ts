import { Constants, ModelType } from "@/common/constants";
import * as path from "path";
import { TreeItemCollapsibleState } from "vscode";
import { Node } from "../interface/node";

export class LinkNode extends Node {
    contextValue = ModelType.Link;
    constructor(info: string) {
        super(info)
        this.iconPath={
            light: path.join(Constants.RES_PATH, "ssh/image/light/link.svg"),
            dark: path.join(Constants.RES_PATH, "ssh/image/dark/link.svg"),
        }
        this.collapsibleState = TreeItemCollapsibleState.None
    }
    getChildren(): Promise<Node[]> {
        return null;
    }
}