import * as path from "path";
import { Constants, ModelType } from "../../common/constants";
import { ConnectionManager } from "../../service/connectionManager";
import { Node } from "../interface/node";
import axios from "axios";
import { IndexNode } from "./indexNode";
import { InfoNode } from "../other/infoNode";

export class EsNode extends Node {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/es.png");
    public contextValue: string = ModelType.ES_CONNECTION;
    constructor(readonly uid: string, readonly parent: Node) {
        super(uid)
        this.init(parent)
        this.cacheSelf()
        const lcp = ConnectionManager.getLastConnectionOption(false);
        if (lcp && lcp.getConnectId() == this.getConnectId()) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/connection-active.svg");
            this.description = `Active`
        }
    }


    async getChildren(): Promise<Node[]> {

        return axios.get("http://localhost:9200/_cat/indices").then(res => {
            let indexes = [];
            const results = res.data.match(/[^\r\n]+/g);
            for (const result of results) {
                indexes.push(new IndexNode(result, this))
            }
            return indexes;
        }).catch(err => {
            return [new InfoNode(err)]
        })

    }

}