import { ConfigKey, MessageType, ModelType } from "@/common/constants";
import { FileManager, FileModel } from "@/common/filesManager";
import { Global } from "@/common/global";
import { Node } from "@/model/interface/node";
import { QueryPage } from "@/view/result/query";
import { EsDataResponse, RunResponse } from "@/view/result/queryResponse";
import axios, { Method } from "axios";
import { ViewColumn, window, workspace } from "vscode";

export interface RestRequest {
    content: any;
    type?: string;
    path?: string;
}
export class EsBaseNode extends Node {

    private static indexCache = {};


    async loadData(request?: RestRequest, sendResult: boolean = true) {

        const ES_DEFAULT_SIZE = 10;
        const pageSize = Global.getConfig(ConfigKey.DEFAULT_LIMIT);
        const type = request?.type || 'get';
        const path = request?.path ? request.path : `/${this.contextValue == ModelType.ES_CONNECTION ? '[index]' : this.label}/_search`;
        const content = request?.content || {
            from: 0,
            size: pageSize,
            query: { "match_all": {} }
        }

        const start = new Date().getTime();
        if (path.indexOf("_search") != -1) {
            QueryPage.send({ connection: this, type: MessageType.RUN, res: { sql: '' } as RunResponse });
        }

        const response = await axios({
            method: type as Method,
            url: `${this.scheme}://${this.host}:${this.port}${path}`,
            responseType: 'json',
            data: content
        }).then(async ({ data }) => {
            if (!data?.hits?.hits) {
                window.showTextDocument(
                    await workspace.openTextDocument(await FileManager.record(`${this.getConnectId()}#result.json`, JSON.stringify(data, null, 2), FileModel.WRITE)),
                    ViewColumn.Two, true
                )
                return;
            }

            const indexName = path.split('/')[1]
            const indexNode = Node.nodeCache[`${this.getConnectId()}_${indexName}`] as Node;
            let fields = (await indexNode?.getChildren())?.map((node: any) => { return { name: node.label, type: node.type, nullable: 'YES' } }) as any

            let rows = data.hits.hits.map((hit: any) => {
                if (!fields) {
                    fields = [];
                    for (const key in hit._source) {
                        fields.push({ name: key, type: 'text', nullable: 'YES' })
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
            fields.unshift(
                { name: "_index", type: 'text', nullable: 'YES' }, { name: "_type", type: 'text', nullable: 'YES' },
                { name: "_id", type: 'text', nullable: 'YES' }, { name: "_score", type: 'text', nullable: 'YES' }
            )
            return { rows, fields, total: data.hits.total, indexName }
        }).catch(err => {
            const reason = err.response.data?.error?.reason || err.response?.data?.error;
            if (reason) {
                window.showErrorMessage(reason)
            }
            throw err
        })

        if (path.indexOf("_search") == -1 || !sendResult) {
            return response;
        }

        const { rows, fields, total, indexName } = response;
        QueryPage.send({
            connection: this, type: request?.content?.from > 0 ? MessageType.NEXT_PAGE : MessageType.DATA, res: {
                sql: "", costTime: new Date().getTime() - start,primaryKey:"_id",
                table: indexName, database: "ElasticSearch", tableCount: 1, columnList: fields,
                data: rows, fields, pageSize: request?.content?.size ? pageSize : ES_DEFAULT_SIZE, total, request: { type, path, content }
            } as EsDataResponse
        });

    }

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