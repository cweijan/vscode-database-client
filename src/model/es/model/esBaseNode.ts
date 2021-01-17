import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";

export class EsBaseNode extends Node {

    public cacheSelf() {
        if (this.contextValue == ModelType.CONNECTION || this.contextValue == ModelType.ES_CONNECTION) {
            Node.nodeCache[`${this.getConnectId()}`] = this;
        } else {
            Node.nodeCache[`${this.getConnectId()}_${this.label}`] = this;
        }
    }
    public getCache() {
        if (this.contextValue == ModelType.CONNECTION) {
            return Node.nodeCache[`${this.getConnectId()}`]

        }
        return Node.nodeCache[`${this.getConnectId()}_${this.label}`]
    }

}