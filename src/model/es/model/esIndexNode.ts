import { ConfigKey, Constants, ModelType } from "@/common/constants";
import { FileManager } from "@/common/filesManager";
import { Global } from "@/common/global";
import { QueryUnit } from "@/service/queryUnit";
import * as path from "path";
import { Range } from "vscode";
import { Node } from "../../interface/node";
import { EsBaseNode } from "./esBaseNode";
import { EsColumnNode } from "./esColumnNode";
import { EsTemplate } from "./esTemplate";


export class ESIndexNode extends EsBaseNode {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/table.svg");
    public contextValue: string = ModelType.ES_INDEX;
    public properties: string;
    constructor(readonly info: string, readonly parent: Node) {
        super(null)
        this.init(parent)
        const [health, status, index, uuid, pri, rep, docsCount, docsDeleted, storeSize, priStoreSize] = info.split(/\s+/)
        this.label = index
        this.cacheSelf()
        this.description = storeSize
        this.command = {
            command: "mysql.show.esIndex",
            title: "Show ES Index Data",
            arguments: [this, true],
        }
    }

    async getChildren(): Promise<Node[]> {

        return this.execute(`get /${this.label}/_mapping`).then(data => {
            const mappings = data[this.label]?.mappings
            if (mappings) {
                // since es7, mappings don't have type.
                const properties = mappings.properties ||mappings[Object.keys(mappings)[0]]?.properties
                this.properties = properties;
                return Object.keys(properties).map(name => {
                    const property = properties[name];
                    return new EsColumnNode(name, property, this)
                })

            }

            return []
        })

    }

    public newQuery() {
        FileManager.show(`${this.getConnectId()}#${this.label}.es`).then(editor => {
            if (editor.document.getText().length == 0) {
                editor.edit(editBuilder => {
                    editBuilder.replace(new Range(0, 0, 0, 0), EsTemplate.query.replace(/myIndex/g,this.label))
                });
            }
        })
    }
    public async countSql() {

        QueryUnit.runQuery(`get /${this.label}/_count`,this)

    }


    viewData() {
        QueryUnit.runQuery(`GET /${this.label}/_search
{ "from": 0, "size": ${Global.getConfig<number>(ConfigKey.DEFAULT_LIMIT)}, "query": { "match_all": {} } }`,this)
    }

}