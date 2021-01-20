import { CacheKey, Constants, ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { NodeUtil } from "@/model/nodeUtil";
import { ViewManager } from "@/view/viewManager";
import * as path from "path";
import { promisify } from "util";
import * as vscode from "vscode";
import RedisBaseNode from "./redisBaseNode";
import { FolderNode } from "./folderNode";
import KeyNode from "./keyNode";
import { Util } from "@/common/util";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";
import { DatabaseCache } from "@/service/common/databaseCache";
import { ConnectionManager } from "@/service/connectionManager";

export class RedisConnectionNode extends RedisBaseNode {


    contextValue = ModelType.REDIS_CONNECTION;
    iconPath: string = path.join(Constants.RES_PATH, `image/redis_connection.png`);
    iconDetailPath: string = path.join(Constants.RES_PATH, `image/code-terminal.svg`);
    
    constructor(readonly uid: string, readonly parent: Node) {
        super(uid)
        this.init(parent)
    }

    async getChildren(): Promise<RedisBaseNode[]> {
        const client = await this.getClient()
        let keys: string[] = await promisify(client.keys).bind(client)(this.pattern);
        return FolderNode.buildChilds(this,"", keys)
    }
    async openTerminal(): Promise<any> {
        const client = await this.getClient()
        ViewManager.createWebviewPanel({
            splitView: true, title: `${this.host}@${this.port}`, preserveFocus: false,
            iconPath: this.iconDetailPath, path: "app",
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", 'terminal')
                }).on("route-terminal", async () => {
                    handler.emit("config", NodeUtil.removeParent(this))
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

    public copyName() {
        Util.copyToBoard(this.host)
    }

    public async deleteConnection(context: vscode.ExtensionContext) {

        Util.confirm(`Are you want to Delete Connection ${this.uid} ? `, async () => {
            const targetContext = this.global === false ? context.workspaceState : context.globalState;
            const connections = targetContext.get<{ [key: string]: Node }>(CacheKey.NOSQL_CONNECTION);
            ConnectionManager.removeConnection(this.uid)
            DatabaseCache.clearDatabaseCache(this.uid)
            delete connections[this.uid];
            await targetContext.update(CacheKey.NOSQL_CONNECTION, NodeUtil.removeParent(connections));
            DbTreeDataProvider.refresh();
        })

    }

}

