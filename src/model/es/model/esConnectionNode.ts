import * as path from "path";
import { Constants, ModelType } from "../../../common/constants";
import { ConnectionManager } from "../../../service/connectionManager";
import { Node } from "../../interface/node";
import { ESIndexNode } from "./esIndexNode";
import { InfoNode } from "../../other/infoNode";
import axios from "axios";
import { FileManager } from "@/common/filesManager";
import { EsBaseNode } from "./esBaseNode";

/**
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html
 */
export class EsConnectionNode extends EsBaseNode {

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


    newQuery(){
        FileManager.show(`${this.uid}.es`)
    }
    
    async getChildren(): Promise<Node[]> {

        return axios.get(`http://${this.host}:${this.port}/_cat/indices`).then(res => {
            let indexes = [];
            const results = res.data.match(/[^\r\n]+/g);
            for (const result of results) {
                indexes.push(new ESIndexNode(result, this))
            }
            return indexes;
        }).catch(err => {
            return [new InfoNode(err)]
        })

    }

}