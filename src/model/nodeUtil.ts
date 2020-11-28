import { Node } from "./interface/node";
import { ConnectionManager } from "../service/connectionManager";

export abstract class NodeUtil {
    public static of(node: any): Node {
        if(!node){
            return null;
        }
        if (node && !(node instanceof Node)) {
            node.__proto__ = Node.prototype
        }
        return node;
    }

    public static getTunnelPort(connectId: string): number {
        return ConnectionManager.getActiveConnectByKey(connectId).ssh.tunnelPort
    }

}