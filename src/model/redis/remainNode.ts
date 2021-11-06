import { TreeItemCollapsibleState } from "vscode";
import { Node } from "../interface/node";
import RedisBaseNode from "./redisBaseNode";

export class RemainNode extends RedisBaseNode{

    constructor(readonly parent: RedisBaseNode) {
        super(`Click to load more`)
        this.init(parent)
        this.collapsibleState=TreeItemCollapsibleState.None;
        this.command = {
            command: "mysql.redis.loadMore",
            title: "Load more redis keys",
            arguments: [this, true],
        }
    }

    click(){
        this.parent.loadMore()
    }

    getChildren(): Promise<Node[]> {
        return null;
    }

}