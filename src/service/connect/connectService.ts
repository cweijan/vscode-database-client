import { ConnectionNode } from "../../model/database/connectionNode";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ViewManager } from "../../common/viewManager";
import { Node } from "../../model/interface/node";
import { NodeUtil } from "../../model/nodeUtil";
import { Util } from "../../common/util";
import { Global } from "../../common/global";
import { ConnectionManager } from "@/service/connectionManager";

export class ConnectService {

    public async openConnect(provider: DbTreeDataProvider, connectionNode?: ConnectionNode) {
        let node: any;
        if (connectionNode) {
            if (connectionNode.global == null) {
                connectionNode.global = true
            }
            node = { ...NodeUtil.removeParent(connectionNode), isGlobal: connectionNode.global !== false }
            if (node.ssh) {
                node.ssh.tunnelPort = null
                if (!node.ssh.algorithms) {
                    node.ssh.algorithms = { cipher: [] }
                }
            }
        }
        ViewManager.createWebviewPanel({
            path: "app", title: "connect",
            splitView: false, iconPath: Global.getExtPath("resources", "icon", "add.svg"),
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit('route', 'connect')
                }).on("route-connect", async () => {
                    if (node) {
                        handler.emit("edit", node)
                    }else{
                        handler.emit("connect")
                    }
                }).on("connecting", async (data) => {
                    const connectionOption = data.connectionOption
                    const connectNode = Util.trim(NodeUtil.of(connectionOption))
                    try {
                        await this.connect(connectNode)
                        await provider.addConnection(connectNode)
                        // handler.panel.dispose();
                        handler.emit("success", 'connect success!')
                    } catch (err) {
                        if (err?.message) {
                            handler.emit("error", err.message)
                        } else {
                            handler.emit("error", err)
                        }
                    }
                }).on("close",()=>{
                    handler.panel.dispose()
                })
            }
        });
    }

    public async connect(connectionNode: Node): Promise<void> {
        ConnectionManager.removeConnection(connectionNode.getConnectId())
        await ConnectionManager.getConnection(connectionNode)
    }

}