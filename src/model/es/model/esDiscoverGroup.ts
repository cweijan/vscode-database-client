import { Node } from "@/model/interface/node";
import { EsBaseNode } from "./esBaseNode";

export class EsDiscoverGroup extends EsBaseNode{
    constructor(readonly parent: Node) {
        super("Discover")
        this.init(parent)
    }
}