import { ConnectionNode } from "../../model/database/connectionNode";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ViewManager } from "../viewManager";
import { Node } from "../../model/interface/node";
import { NodeUtil } from "../../model/nodeUtil";
import { Util } from "../../common/util";
import { Global } from "../../common/global";

export abstract class AbstractConnectService {

    protected abstract connect(connectionNode: Node): Promise<any> | any;

    public async openConnect(provider: DbTreeDataProvider, connectionNode?: ConnectionNode) {
        let node: any;
        if (connectionNode) {
            if (connectionNode.global == null) {
                connectionNode.global = true
            }
            node = { ...connectionNode, isGlobal: connectionNode.global !== false }
            if (node.ssh) {
                node.ssh.tunnelPort = null
                if(!node.ssh.algorithms){
                    node.ssh.algorithms={ cipher:[] }
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
                    if (node) handler.emit("edit", node)
                }).on("connecting", async (data) => {
                    const connectionOption = data.connectionOption
                    const connectNode = Util.trim(NodeUtil.of(connectionOption))
                    try {
                        await this.connect(connectNode)
                        provider.addConnection(connectNode)
                        handler.panel.dispose();
                    } catch (err) {
                        handler.emit("error", err)
                    }
                })
            }
        });
    }

}