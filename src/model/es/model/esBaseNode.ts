import { ConfigKey, MessageType, ModelType } from "@/common/constants";
import { FileManager, FileModel } from "@/common/filesManager";
import { Global } from "@/common/global";
import { Node } from "@/model/interface/node";
import { resolveType } from "@/service/dump/mysql/resolveType";
import { QueryPage } from "@/view/result/query";
import { EsDataResponse, RunResponse } from "@/view/result/queryResponse";
import axios, { Method } from "axios";
import { pathToFileURL } from "url";
import { ViewColumn, window, workspace } from "vscode";

export interface RestRequest {
    content: any;
    type?: string;
    path?: string;
}
export class EsBaseNode extends Node {



    async loadData(request?: RestRequest, sendResult: boolean = true) {

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
            const reason = err.response.data.error.reason;
            if(reason){
                window.showErrorMessage(reason)
            }
            throw err
        })

        if (path.indexOf("_search") == -1 || !sendResult) {
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