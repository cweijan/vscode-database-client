import { CodeCommand, Constants, ModelType, RedisType } from "@/common/constants";
import { Util } from "@/common/util";
import { ViewManager } from "@/common/viewManager";
import { Node } from "@/model/interface/node";
import * as path from "path";
import { commands, ThemeIcon, TreeItemCollapsibleState, window } from "vscode";
import RedisBaseNode from "./redisBaseNode";

export default class KeyNode extends RedisBaseNode {

    readonly contextValue = ModelType.REDIS_KEY;
    readonly iconPath = new ThemeIcon("key");
    readonly iconDetailPath = path.join(Constants.RES_PATH, `image/redis_connection.png`);
    constructor(public label: string, readonly prefix: string, readonly parent: Node) {
        super(label);
        this.init(parent)
        this.collapsibleState = TreeItemCollapsibleState.None
        if (Util.supportColorIcon()) {
            this.iconPath = new ThemeIcon("key", new ThemeIcon('charts.yellow'))
        }
        this.command = {
            title: 'View Key Detail',
            command: 'mysql.redis.key.detail',
            arguments: [this]
        }
    }

    async getChildren(): Promise<RedisBaseNode[]> {
        return [];
    }

    public async delete(keyNodeList: KeyNode[]) {
        if (keyNodeList) {
            Util.confirm('Do you want to delete all the selected keys' , async () => {
                const client = await this.getClient();
                await Promise.all(keyNodeList.filter(n=>n instanceof KeyNode).map(n => client.del(n.label)))
                this.provider.reload()
            })
        } else {
            Util.confirm( `Do you want to delete the key ${this.label} ?`, async () => {
                const client = await this.getClient();
                await client.del(this.label)
                this.provider.reload()
            })
        }
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
                content = await client.zrange(this.label, 0, await client.zcard(this.label), 'WITHSCORES')
                if (content && content instanceof Array) {
                    content = content.filter((_, i) => i % 2 == 0).map((value, i) => ({
                        value, score: content[i * 2 + 1]
                    }))
                }
                break;
                default:
                    window.showErrorMessage(`Unsupport type ${type}!`)
                    return;
        }
        const title = `${type}:${this.label}`;

        ViewManager.createWebviewPanel({
            path: "app", splitView: false, title, type: "Info", singlePage: true,
            iconPath: this.iconDetailPath,
            eventHandler: async (handler) => {
                handler.on("init", () => {
                    handler.emit("route", 'keyView')
                }).on("route-keyView", async () => {
                    handler.panel.title = Util.limitTitle(title)
                    handler.emit("detail", {
                        res: {
                            content, type, name: this.label,
                            ttl: await client.ttl(this.label)
                        }
                    })
                }).on("refresh", () => {
                    this.detail()
                }).on("update", async (content) => {
                    let curKey=content.key.name;
                    let newKey=content.key.newName;
                    if(curKey != newKey){
                        await client.rename(curKey,newKey)
                        curKey=newKey;
                        this.label=newKey;
                    }
                    switch (content.key.type) {
                        case 'string':
                            await client.set(curKey, content.key.content)
                            handler.emit("msg", `Update key ${curKey} to new value success!`)
                            if(newKey){
                                this.detail()
                                commands.executeCommand(CodeCommand.Refresh,this.parent)
                            }
                            break;
                    }
                }).on("rename", async (content) => {
                    await client.rename(content.key.name, content.key.newName)
                    this.label=content.key.newName
                    this.detail()
                    this.provider.reload(this.parent)
                }).on("del", async (content) => {
                    await client.del(content.key.name)
                }).on("ttl", async (content) => {
                    await client.expire(content.key.name, content.key.ttl)
                    handler.emit("msg", `Change TTL for key:${content.key.name} success!`)
                }).on("add", async content => {
                    switch (type) {
                        case RedisType.hash:
                            client.hset(this.label, content.key, content.value)
                            break;
                        case RedisType.list:
                            client.lpush(this.label, 0, content.value)
                            break;
                        case RedisType.set:
                            client.sadd(this.label, content.value)
                            break;
                        case RedisType.zset:
                            client.zadd(this.label, 0, content.value)
                            break;
                    }
                    handler.emit("refresh")
                }).on("deleteLine", async content => {
                    switch (type) {
                        case RedisType.hash:
                            client.hdel(this.label, content.key)
                            break;
                        case RedisType.list:
                            client.lrem(this.label, 0, content)
                            break;
                        case RedisType.set:
                            client.srem(this.label, content)
                            break;
                        case RedisType.zset:
                            client.zrem(this.label, content)
                            break;
                    }
                    handler.emit("refresh")
                })
            }
        })

    }

}