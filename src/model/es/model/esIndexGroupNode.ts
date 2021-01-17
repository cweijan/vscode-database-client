import { Node } from "@/model/interface/node";
import { TableGroup } from "@/model/main/tableGroup";
import { ESIndexNode } from "./esIndexNode";

export class EsIndexGroup extends TableGroup {
    constructor(readonly parent: Node) {
        super(parent)
        this.label = "Index"
    }

    async getChildren(): Promise<Node[]> {
        return this.execute(`get /_cat/indices`).then((res: string) => {
            let indexes = [];
            const results = res.match(/[^\r\n]+/g);
            for (const result of results) {
                indexes.push(new ESIndexNode(result, this))
            }
            return indexes;
        })
    }

}