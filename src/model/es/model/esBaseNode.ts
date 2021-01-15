import { ConfigKey, MessageType, ModelType } from "@/common/constants";
import { Global } from "@/common/global";
import { Node } from "@/model/interface/node";
import { resolveType } from "@/service/dump/mysql/resolveType";
import { QueryPage } from "@/view/result/query";
import { EsDataResponse, RunResponse } from "@/view/result/queryResponse";
import axios, { Method } from "axios";
import { pathToFileURL } from "url";
import { window } from "vscode";

export interface RestRequest {
    content: any;
    type?: string;
    path?: string;
}
export class EsBaseNode extends Node {



    async loadData(request?: RestRequest, sendResult: boolean = true) {

        // "bool": { 
        //     "must": [
        //       { "match": { "title":   "Search"        }},
        //       { "match": { "content": "Elasticsearch" }}
        //     ],
        //     "filter": [ 
        //       { "term":  { "status": "published" }},
        //       { "range": { "publish_date": { "gte": "2015-01-01" }}}
        //     ]
        //   }

        const pageSize = Global.getConfig(ConfigKey.DEFAULT_LIMIT);
        const type = request?.type || 'get';
        const path = request?.path ? request.path : `/${this.contextValue == ModelType.ES_CONNECTION ? '[index]' : this.label}/_search`;
        const content = request?.content || {
            from: 0,
            size: pageSize,
            query: { "match_all": {} }
        }

        const start = new Date().getTime();
        QueryPage.send({ connection: this, type: MessageType.RUN, res: { sql: '' } as RunResponse });
        const response = await axios({
            method: type as Method,
            url: `http://${this.host}:${this.port}${path}`,
            responseType: 'json',
            data: content
        }).then(({ data }) => {
            let fields = [];
            let rows = data.hits.hits.map((hit: any) => {
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
            return { rows, fields, total: data.hits.total }
        }).catch(err => {
            window.showErrorMessage(err)
            throw err
        })

        if (!sendResult) {
            return response;
        }

        const { rows, fields, total } = response;
        QueryPage.send({
            connection: this, type: request?.content?.from > 0 ? MessageType.NEXT_PAGE : MessageType.DATA, res: {
                sql: "", costTime: new Date().getTime() - start,
                data: rows, fields, pageSize, total, request: { type, path, content }
            } as EsDataResponse
        });

    }

}