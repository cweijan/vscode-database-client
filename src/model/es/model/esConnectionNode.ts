import * as path from "path";
import { Constants, ModelType } from "../../../common/constants";
import { ConnectionManager } from "../../../service/connectionManager";
import { Node } from "../../interface/node";
import { ESIndexNode } from "./esIndexNode";
import { InfoNode } from "../../other/infoNode";
import axios from "axios";
import { FileManager } from "@/common/filesManager";
import { EsBaseNode } from "./esBaseNode";
import { Range } from "vscode";
import { EsTemplate } from "./esTemplate";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";

/**
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html
 */
export class EsConnectionNode extends EsBaseNode {

    private static versionMap = {}
    public iconPath: string = path.join(Constants.RES_PATH, "icon/es.png");
    public contextValue: string = ModelType.ES_CONNECTION;
    constructor(readonly uid: string, readonly parent: Node) {
        super(uid)
        this.init(parent)
        this.cacheSelf()
        const lcp = ConnectionManager.getLastConnectionOption(false);

        if (lcp && lcp.getConnectId() == this.getConnectId()) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/connection-active.svg");
        }

        if (EsConnectionNode.versionMap[this.uid]) {
            this.description = EsConnectionNode.versionMap[this.uid]
        } else {
            axios.get(`${this.scheme}://${this.host}:${this.port}`).then(res => {
                this.description=`version: ${res.data.version.number}`
                EsConnectionNode.versionMap[this.uid]=this.description
                DbTreeDataProvider.refresh(this)
            }).catch(err=>{
                console.log(err)
            })
        }

    }


    newQuery() {
        FileManager.show(`${this.uid}.es`).then(editor => {
            if (editor.document.getText().length == 0) {
                editor.edit(editBuilder => {
                    editBuilder.replace(new Range(0, 0, 0, 0), EsTemplate.query)
                });
            }
        })
    }

    async getChildren(): Promise<Node[]> {

        return axios.get(`${this.scheme}://${this.host}:${this.port}/_cat/indices`).then(res => {
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