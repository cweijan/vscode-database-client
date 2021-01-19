import { Constants, ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import * as path from "path";
import { TreeItemCollapsibleState } from "vscode";
import RedisBaseNode from "./redisBaseNode";


export class FolderNode extends RedisBaseNode {
    contextValue = ModelType.REDIS_FOLDER;
    readonly iconPath = path.join(Constants.RES_PATH, `image/folder.svg`);
    constructor(readonly label: string, readonly childens: Node[], readonly parent: Node) {
        super(label)
        this.init(parent)
        this.collapsibleState = TreeItemCollapsibleState.Collapsed
        // this.collapsibleState = NodeState.get(this)
    }

    public async getChildren() {
        return this.childens;
    }

}

