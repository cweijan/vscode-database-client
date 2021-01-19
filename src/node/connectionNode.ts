import { Constants, ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { NodeUtil } from "@/model/nodeUtil";
import { ViewManager } from "@/view/viewManager";
import * as path from "path";
import { promisify } from "util";
import * as vscode from "vscode";
import AbstractNode from "./abstracNode";
import { FolderNode } from "./folderNode";
import KeyNode from "./keyNode";

export class RedisConnectionNode extends AbstractNode {


    contextValue = ModelType.REDIS_CONNECTION;
    iconPath: string = path.join(Constants.RES_PATH, `image/redis_connection.png`);
    iconDetailPath: string = path.join(Constants.RES_PATH, `image/code-terminal.svg`);
    pattern = "*";
    constructor(readonly uid: string, readonly parent: Node) {
        super(uid)
        this.init(parent)
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        //     this.collapsibleState = NodeState.get(this)
    }

    async getChildren(): Promise<AbstractNode[]> {
        const client = await this.getClient()
        let keys: string[] = await promisify(client.keys).bind(client)(this.pattern);
        keys = keys.slice(0, 5000)
        const prefixMap: { [key: string]: AbstractNode[] } = {}
        for (const key of keys.sort()) {
            let prefix = key.replace(this.pattern.replace("*", ""), "").split(":")[0];
            if (!prefixMap[prefix]) prefixMap[prefix] = []
            prefixMap[prefix].push(new KeyNode(key, prefix, this))
        }

        return Object.keys(prefixMap).map((prefix: string) => {
            if (prefixMap[prefix].length > 1) {
                return new FolderNode(prefix,prefixMap[prefix],this)
            } else {
                return prefixMap[prefix][0]
            }
        })
    }
    async openTerminal(): Promise<any> {
        const client = await this.getClient()
        ViewManager.createWebviewPanel({
            splitView: true, title: `${this.host}@${this.port}`,
            iconPath: this.iconDetailPath, path: "app",
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", 'terminal')
                }).on("route-terminal", async () => {
                    handler.emit("config", ...NodeUtil.removeParent(this))
                }).on("exec", (content) => {
                    if (!content) {
                        return;
                    }
                    const splitCommand: string[] = content.replace(/ +/g, " ").split(' ')
                    const command = splitCommand.shift()
                    client.send_command(command, splitCommand, (err, response) => {
                        const reply = err ? err.message : response
                        handler.emit("result", reply)
                    })
                }).on("exit", () => {
                    handler.panel.dispose()
                })
            }
        })
    }

    async showStatus(): Promise<any> {
        const client = await this.getClient()
        client.info((err, reply) => {
            ViewManager.createWebviewPanel({
                title: "Redis Server Status", splitView: false,
                path: "app",
                eventHandler: (handler) => {
                    handler.on("init", () => {
                        handler.emit("route", 'redisStatus')
                    }).on("route-redisStatus", async () => {
                        handler.emit("info", reply)
                    })
                }
            })
        })
    }

}

