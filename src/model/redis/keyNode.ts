import { Constants, ModelType, RedisType } from "@/common/constants";
import { ViewManager } from "@/common/viewManager";
import { Node } from "@/model/interface/node";
import * as path from "path";
import { TreeItemCollapsibleState } from "vscode";
import RedisBaseNode from "./redisBaseNode";

export default class KeyNode extends RedisBaseNode {

    readonly contextValue = ModelType.REDIS_KEY;
    readonly iconPath = path.join(Constants.RES_PATH, `image/redis_key.png`);
    readonly iconDetailPath = path.join(Constants.RES_PATH, `image/redis.svg`);
    constructor(readonly label: string, readonly prefix: string, readonly parent: Node) {
        super(label);
        this.init(parent)
        this.collapsibleState = TreeItemCollapsibleState.None
        this.command = {
            title: 'View Key Detail',
            command: 'mysql.redis.key.detail',
            arguments: [this]
        }
    }

    /**
     * @todo Split the key by ':' and group them
     */
    async getChildren(): Promise<RedisBaseNode[]> {
        return [];
    }

    public async delete() {
        const client = await this.getClient();
        await client.del(this.label)
        this.provider.reload()
    }


    public async detail() {

        const client = await this.getClient();
        const type = await client.type(this.label)
        let content: any;
        switch (type) {
            case RedisType.string:
                content = await client.get(this.label)
                break;
            case RedisType.hash:
                const hall = await client.hgetall(this.label)
                content = Object.keys(hall).map(key => {
                    return { key, value: hall[key] }
                })
                break;
            case RedisType.list:
                content = await client.lrange(this.label, 0, await client.llen(this.label))
                break;
            case RedisType.set:
                content = await client.smembers(this.label)
                break;
            case RedisType.zset:
                content = await client.zrange(this.label, 0, await client.zcard(this.label))
                break;
        }
        const title = `${type}:${this.label}`;

        ViewManager.createWebviewPanel({
            path: "app", splitView: false, title, type: "Info", singlePage: true,
            iconPath: this.iconDetailPath,
            eventHandler: async (handler) => {
                handler.on("init", () => {
                    handler.emit("route", 'keyView')
                }).on("route-keyView", async () => {
                    handler.panel.title = title
                    handler.emit("detail", {
                        res: {
                            content, type, name: this.label,
                            ttl: await client.ttl(this.label)
                        }
                    })
                }).on("refresh", () => {
                    this.detail()
                }).on("update", async (content) => {
                    switch (content.key.type) {
                        case 'string':
                            await client.set(content.key.name, content.key.content)
                            handler.emit("msg", `Update key ${content.key.name} to new value success!`)
                            break;
                    }
                }).on("rename", async (content) => {
                    await client.rename(content.key.name, content.key.newName)
                    this.detail()
                }).on("del", async (content) => {
                    await client.del(content.key.name)
                }).on("ttl", async (content) => {
                    await client.expire(content.key.name, content.key.ttl)
                    handler.emit("msg", `Change TTL for key:${content.key.name} success!`)
                })
            }
        })

    }

}