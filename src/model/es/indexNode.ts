import { ConfigKey, Constants, MessageType, ModelType } from "@/common/constants";
import { Global } from "@/common/global";
import { QueryUnit } from "@/service/queryUnit";
import { QueryPage } from "@/view/result/query";
import { DataResponse, EsDataResponse, RunResponse } from "@/view/result/queryResponse";
import axios from "axios";
import * as path from "path";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { EsColumnNode } from "./indexColumnNode";


export class IndexNode extends Node {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/table.svg");
    public contextValue: string = ModelType.ES_INDEX;
    public properties: string;
    constructor(readonly info: string, readonly parent: Node) {
        super(null)
        this.init(parent)
        const [health, status, index, uuid, pri, rep, docsCount, docsDeleted, storeSize, priStoreSize] = info.split(/\s+/)
        this.label = index
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


    loadData(request: any) {

        const pageSize = Global.getConfig(ConfigKey.DEFAULT_LIMIT);
        if (!request) {
            request = {
                from: 0,
                size: pageSize,
                query: { "match_all": {} }
            };
        }

        const start = new Date().getTime();
        QueryPage.send({ connection: this, type: MessageType.RUN, res: { sql:'' } as RunResponse });
        axios.get(`http://${this.host}:${this.port}/${this.label}/_search`, {
            data: request
        }).then(({ data }) => {
            let fields = [];
            let result = data.hits.hits.map((hit: any) => {
                if (fields.length == 0) {
                    fields.push({ name: "_index" }, { name: "_type" }, { name: "_id" }, { name: "_score" })
                    for (const key in hit._source) {
                        fields.push({ name: key })
                    }
                }
                let row = { _index: hit._index, _type: hit._type, _id: hit._id, _score: hit._score }
                for (const key in hit._source) {
                    row[key] = hit._source[key]
                    if (row[key] instanceof Object) {
                        row[key] = JSON.stringify(row[key])
                    }
                }
                return row
            })
            QueryPage.send({
                connection: this, type: MessageType.DATA, res: {
                    sql: "", costTime: new Date().getTime() - start,
                    data: result, fields, pageSize,
                    total: data.hits.total, request
                } as EsDataResponse
            });
        })


    }

    public async countSql() {

        const start = new Date().getTime();
        return axios.get(`http://${this.host}:${this.port}/${this.label}/_count`).then(({ data }) => {
            QueryPage.send({ connection: this, type: MessageType.DATA, res: { sql: "", costTime: new Date().getTime() - start, data: [{ count: data.count }], fields: [{ name: 'count' }], pageSize: Global.getConfig(ConfigKey.DEFAULT_LIMIT) } as DataResponse });
        })

    }

}