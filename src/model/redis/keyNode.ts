import { CommandKey, Constants, ModelType, RedisType } from "@/common/constants";
import { Global } from "@/common/global";
import { Node } from "@/model/interface/node";
import { ViewManager } from "@/view/viewManager";
import * as path from "path";
import { promisify } from "util";
import * as vscode from "vscode";
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
        await promisify(client.del).bind(client)(this.label)
        vscode.commands.executeCommand(CommandKey.Refresh)
    }


    public async detail() {

        const client = await this.getClient();
        const type = await promisify(client.type).bind(client)(this.label)
        let content: any;
        switch (type) {
            case RedisType.string:
                content = await promisify(client.get).bind(client)(this.label)
                break;
            case RedisType.hash:
                const hall = await promisify(client.hgetall).bind(client)(this.label)
                content = Object.keys(hall).map(key => {
                    return { key, value: hall[key] }
                })
                break;
            case RedisType.list:
                content = await promisify(client.lrange).bind(client)
                    (this.label, 0, await promisify(client.llen).bind(client)(this.label))
                break;
            case RedisType.set:
                content = await promisify(client.smembers).bind(client)(this.label)
                break;
            case RedisType.zset:
                content = await promisify(client.zrange).bind(client)
                    (this.label, 0, await promisify(client.zcard).bind(client)(this.label))
                break;
        }
        const title = `${type}:${this.label}`;

        ViewManager.createWebviewPanel({
            path: "app", splitView: false, title, type:"Info",singlePage: true,
            iconPath: this.iconDetailPath,
            eventHandler: async (handler) => {
                handler.on("init", () => {
                    handler.emit("route", 'keyView')
                }).on("route-keyView", async () => {
                    handler.panel.title=title
                    handler.emit("detail", {
                        res: {
                            content, type, name: this.label,
                            ttl: await promisify(client.ttl).bind(client)(this.label)
                        }
                    })
                }).on("refresh", () => {
                    this.detail()
                }).on("update", async (content) => {
                    switch (content.key.type) {
                        case 'string':
                            await promisify(client.set).bind(client)(content.key.name, content.key.content)
                            handler.emit("msg", `Update key ${content.key.name} to new value success!`)
                            break;
                    }
                }).on("rename", async (content) => {
                    await promisify(client.rename).bind(client)(content.key.name, content.key.newName)
                    this.detail()
                }).on("del",async (content)=>{
                    await promisify(client.del).bind(client)(content.key.name)
                }).on("ttl",async (content)=>{
                    await promisify(client.expire).bind(client)(content.key.name, content.key.ttl)
                    handler.emit("msg", `Change TTL for key:${content.key.name} success!`)
                })
            }
        })

    }

}