import { Node } from "./interface/node";
import { ConnectionManager } from "../service/connectionManager";
import { SqlDialect } from "@/service/dialect/sqlDialect";

export abstract class NodeUtil {
    public static of(node: any): Node {
        if (!node) {
            return null;
        }
        if (node && !(node instanceof Node)) {
            node.__proto__ = Node.prototype
        }
        if (node.dialect && !(node.dialect instanceof SqlDialect)) {
            node.dialect.__proto__ = SqlDialect.prototype
        }
        return node;
    }

    public static removeParent(nodes: any): any {
        if (!nodes) return null;
        let result = {};
        for (const nodeKey of Object.keys(nodes)) {
            if (!nodes[nodeKey]) continue;
            result[nodeKey] = { ...nodes[nodeKey], parent: null }
        }
        return result;
    }

    public static getTunnelPort(connectId: string): number {
        return ConnectionManager.getActiveConnectByKey(connectId).ssh.tunnelPort
    }

}