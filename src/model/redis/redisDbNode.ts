import { Constants, ModelType } from "@/common/constants";
import { RedisDBMeta } from "@/common/typeDef";
import { Cluster } from "ioredis";
import * as path from "path";
import * as vscode from "vscode";
import { Node } from "../interface/node";
import { RedisFolderNode } from "./folderNode";
import RedisBaseNode from "./redisBaseNode";
import { RemainNode } from "./remainNode";

export class RedisDbNode extends RedisBaseNode {

    private loadingMore = false;
    contextValue = ModelType.REDIS_DB;
    iconPath: string | vscode.ThemeIcon = new vscode.ThemeIcon("database", new vscode.ThemeColor('dropdown.foreground'));
    keys: string[];

    constructor(readonly meta: RedisDBMeta, readonly parent: Node) {
        super(meta.name);
        this.init(parent)

        this.database = meta.name;
        this.description = meta.keys ? `(${meta.keys})` : '';
    }

    async getChildren(isRresh?: boolean): Promise<RedisBaseNode[]> {
        if (isRresh) {
            this.cursor = '0';
            this.cursorHolder = {};
        }
        if (this.loadingMore) {
            this.loadingMore = false;
        } else {
            this.keys = await this.getKeys()
        }
        const childens = RedisFolderNode.buildChilds(this, this.keys);
        if (this.hasMore()) {
            childens.unshift(new RemainNode(this))
        }
        return childens;
    }

    private hasMore() {
        if (!this.isCluster) {
            return this.cursor != '0';
        }
        for (const key in this.cursorHolder) {
            const cursor = this.cursorHolder[key];
            if (cursor != '0') return true;
        }
        return false;
    }

    public async loadMore() {
        if (!this.hasMore()) {
            vscode.window.showErrorMessage("Has no more keys!")
            return;
        }
        this.loadingMore = true;
        this.keys.push(...(await this.getKeys()))
        this.provider.reload(this)
    }

    public async getKeys() {
        const client = await this.getClient()
        if (this.isCluster) {
            return await this.keysCluster(client as Cluster, this.pattern)
        }
        const scanResult = await client.scan(this.cursor, "COUNT", 3000, "MATCH", this.pattern + "*");
        this.cursor = scanResult[0]
        return scanResult[1];
    }

    private async keysCluster(client: Cluster, pattern: string): Promise<string[]> {
        const masters = client.nodes("master");
        const maxKeys = 3000 / masters.length | 0;
        const mastersScan = await Promise.all(masters.map(async (master) => {
            const mKey = master.options.host + "@" + master.options.port;
            const cursor = this.cursorHolder[mKey] || 0;
            if (cursor === '0') return null;
            const scanResult = await master.scan(cursor, "COUNT", maxKeys, "MATCH", pattern + '*')
            this.cursorHolder[mKey] = scanResult[0];
            return scanResult[1]
        }));
        return [...new Set(mastersScan.filter(keys => keys).flat())];
    }


}