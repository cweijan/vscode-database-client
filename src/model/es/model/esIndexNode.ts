import { ConfigKey, Constants, MessageType, ModelType } from "@/common/constants";
import { Global } from "@/common/global";
import { QueryPage } from "@/view/result/query";
import { DataResponse } from "@/view/result/queryResponse";
import axios from "axios";
import * as path from "path";
import { Node } from "../../interface/node";
import { InfoNode } from "../../other/infoNode";
import { EsBaseNode } from "./esBaseNode";
import { EsColumnNode } from "./esColumnNode";


export class ESIndexNode extends EsBaseNode {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/table.svg");
    public contextValue: string = ModelType.ES_INDEX;
    public properties: string;
    constructor(readonly info: string, readonly parent: Node) {
        super(null)
        this.init(parent)
        this.cacheSelf()
        const [health, status, index, uuid, pri, rep, docsCount, docsDeleted, storeSize, priStoreSize] = info.split(/\s+/)
        this.label = index
        this.description = storeSize
        this.command = {
            command: "mysql.show.esIndex",
            title: "Show ES Index Data",
            arguments: [this, true],
        }
    }

    async getChildren(): Promise<Node[]> {

        return axios.get(`http://${this.host}:${this.port}/${this.label}/_mapping`).then(res => {
            const mappings = res.data[this.label]?.mappings
            if (mappings) {
                const properties = mappings[Object.keys(mappings)[0]]?.properties
                this.properties = properties;
                return Object.keys(properties).map(name => {
                    const property = properties[name];
                    return new EsColumnNode(name, property, this)
                })

            }

            return []
        }).catch(err => {
            return [new InfoNode(err)]
        })

    }

    public async countSql() {

        const start = new Date().getTime();
        return axios.get(`http://${this.host}:${this.port}/${this.label}/_count`).then(({ data }) => {
            QueryPage.send({ connection: this, type: MessageType.DATA, res: { sql: "", costTime: new Date().getTime() - start, data: [{ count: data.count }], fields: [{ name: 'count' }], pageSize: Global.getConfig(ConfigKey.DEFAULT_LIMIT) } as DataResponse });
        })

    }

}