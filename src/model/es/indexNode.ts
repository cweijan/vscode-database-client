import * as path from "path";
import { ConfigKey, Constants, MessageType, ModelType } from "@/common/constants";
import { ConnectionManager } from "@/service/connectionManager";
import { Node } from "../interface/node";
import axios from "axios";
import { InfoNode } from "../other/infoNode";
import { EsColumnNode } from "./esColumnNode";
import { QueryUnit } from "@/service/queryUnit";
import { Global } from "@/common/global";
import { QueryPage } from "@/view/result/query";
import { DataResponse } from "@/view/result/queryResponse";


export class IndexNode extends Node {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/table.svg");
    public contextValue: string = ModelType.ES_INDEX;
    public properties: string;
    constructor(readonly info: string, readonly parent: Node) {
        super(null)
        this.init(parent)
        const [health, status, index, uuid, pri, rep, docsCount, docsDeleted, storeSize, priStoreSize] = info.split(/\s+/)
        this.label = index
        const lcp = ConnectionManager.getLastConnectionOption(false);
        if (lcp && lcp.getConnectId() == this.getConnectId()) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/connection-active.svg");
            this.description = `Active`
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


    public async showSource() {
        if (!this.properties) {
            await this.getChildren()
        }
        QueryUnit.showSQLTextDocument(this, JSON.stringify(this.properties, null, 2), 'source.json');
    }


}