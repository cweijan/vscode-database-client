import { DatabaseType } from "@/common/constants";
import { ConnectionManager } from "@/service/connectionManager";
import * as os from "os";
import { platform } from "os";
import { window } from "vscode";
import { Global } from "../../common/global";
import { Util } from "../../common/util";
import { ViewManager } from "../../common/viewManager";
import { ConnectionNode } from "../../model/database/connectionNode";
import { Node } from "../../model/interface/node";
import { NodeUtil } from "../../model/nodeUtil";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ClientManager } from "../ssh/clientManager";
var commandExistsSync = require('command-exists').sync;

export class ConnectService {

    public async openConnect(provider: DbTreeDataProvider, connectionNode?: ConnectionNode) {
        let node: any;
        if (connectionNode) {
            node = { ...NodeUtil.removeParent(connectionNode), isGlobal: connectionNode.global }
            if (node.ssh) {
                node.ssh.tunnelPort = null
                if (!node.ssh.algorithms) {
                    node.ssh.algorithms = { cipher: [] }
                }
            }
        }
        let plat:string = platform();
        ViewManager.createWebviewPanel({
            path: "app", title: connectionNode ? "edit" : "connect",
            splitView: false, iconPath: Global.getExtPath("resources", "icon", "connection.svg"),
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit('route', 'connect')
                }).on("route-connect", async () => {
                    if (node) {
                        handler.emit("edit", node)
                    } else {
                        handler.emit("connect")
                    }
                    const exists = plat == 'win32' ? true : commandExistsSync("sqlite");
                    handler.emit("sqliteState", exists)
                }).on("installSqlite", () => {
                    let command: string;
                    switch (plat) {
                        case 'darwin':
                            command = `brew install sqlite3`
                            break;
                        case 'linux':
                            if (commandExistsSync("apt")) {
                                command = `sudo apt -y install sqlite`;
                            } else if (commandExistsSync("yum")) {
                                command = `sudo yum -y install sqlite3`;
                            } else if (commandExistsSync("dnf")) { 
                                command = `sudo dnf install sqlite` // Fedora
                            } else {
                                command = `sudo pkg install -y sqlite3` // freebsd
                            }
                            break;
                        default: return;
                    }
                    const terminal = window.createTerminal("installSqlite")
                    terminal.sendText(command)
                    terminal.show()
                }).on("connecting", async (data) => {
                    const connectionOption = data.connectionOption
                    const connectNode = Util.trim(NodeUtil.of(connectionOption))
                    try {
                        await this.connect(connectNode)
                        await provider.addConnection(connectNode)
                        handler.emit("success", { message: 'connect success!', key: connectNode.key })
                    } catch (err) {
                        if (err?.message) {
                            handler.emit("error", err.message)
                        } else {
                            handler.emit("error", err)
                        }
                    }
                }).on("close", () => {
                    handler.panel.dispose()
                }).on("choose", ({ event, filters }) => {
                    window.showOpenDialog({ filters }).then((uris) => {
                        const uri = uris[0]
                        if (uri) {
                            handler.emit("choose", { event, path: uri.fsPath })
                        }
                    })
                })
            }
        });
    }

    public async connect(connectionNode: Node): Promise<void> {
        if (connectionNode.dbType == DatabaseType.SSH) {
            await ClientManager.getSSH(connectionNode.ssh, false)
            return;
        }
        ConnectionManager.removeConnection(connectionNode.getConnectId())
        await ConnectionManager.getConnection(connectionNode)
    }

}