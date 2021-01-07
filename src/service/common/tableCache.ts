import { TableNode } from "@/model/main/tableNode";

export class TableCache {
    private static tableNode = {};
    private static tableNodeByName = {};
    public static getNodeById(uid: string): TableNode {
        return this.tableNode[uid]
    }
    public static getNodeByName(name: string): TableNode {
        return this.tableNodeByName[name]
    }
    public static put(uid: string, node: TableNode) {
        this.tableNode[uid] = node
        this.tableNodeByName[node.label] = node
    }
}