import { Constants, ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import * as path from "path";
import KeyNode from "./keyNode";
import RedisBaseNode from "./redisBaseNode";


export class FolderNode extends RedisBaseNode {
    contextValue = ModelType.REDIS_FOLDER;
    readonly iconPath = path.join(Constants.RES_PATH, `image/folder.svg`);
    constructor(readonly label: string, readonly prefix: string, readonly childens: string[], readonly parent: Node) {
        super(label)
        this.init(parent)
        this.pattern = label
    }

    public async getChildren() {
        return FolderNode.buildChilds(this, `${this.prefix}${this.label}`, this.childens)
    }

    public static buildChilds(parent: RedisBaseNode, parentPrefix: string, keys: string[]) {
        if (parentPrefix) {
            parentPrefix = parentPrefix + ":"
        }
        const prefixMap: { [key: string]: string[] } = {}
        for (const key of keys.sort()) {
            let prefix = key.replace(parentPrefix, "").split(":")[0];
            if (!prefixMap[prefix]) prefixMap[prefix] = []
            prefixMap[prefix].push(key)
        }

        return Object.keys(prefixMap).map((prefix: string) => {
            if (prefixMap[prefix].length > 1) {
                return new FolderNode(prefix, parentPrefix, prefixMap[prefix], parent)
            } else {
                return new KeyNode(prefixMap[prefix][0], prefix, parent)
            }
        })
    }

}

