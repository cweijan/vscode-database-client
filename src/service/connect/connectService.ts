import { ConnectionNode } from "../../model/database/connectionNode";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ViewManager } from "../../common/viewManager";
import { Node } from "../../model/interface/node";
import { NodeUtil } from "../../model/nodeUtil";
import { Util } from "../../common/util";
import { Global } from "../../common/global";
import { ConnectionManager } from "@/service/connectionManager";
import { DatabaseType } from "@/common/constants";
import { ClientManager } from "../ssh/clientManager";
import { window } from "vscode";

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
        ViewManager.createWebviewPanel({
            path: "app", title: "connect",
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
                }).on("choose",({event,filters})=>{
                    window.showOpenDialog({filters}).then((uris)=>{
                        const uri=uris[0]
                        if(uri){
                            handler.emit("choose",{event,path:uri.fsPath})
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