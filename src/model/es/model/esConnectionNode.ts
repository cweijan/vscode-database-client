import { FileManager } from "@/common/filesManager";
import { Util } from "@/common/util";
import { QueryGroup } from "@/model/query/queryGroup";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";
import * as path from "path";
import { ExtensionContext, Range, TreeItemCollapsibleState } from "vscode";
import { Constants, ModelType } from "../../../common/constants";
import { ConnectionManager } from "../../../service/connectionManager";
import { CommandKey, Node } from "../../interface/node";
import { EsBaseNode } from "./esBaseNode";
import { EsIndexGroup } from "./esIndexGroupNode";
import { EsTemplate } from "./esTemplate";

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

        if (this.disable) {
            this.collapsibleState = TreeItemCollapsibleState.None;
            this.iconPath = path.join(Constants.RES_PATH, "icon/close.svg");
            return;
        }

        if (lcp && lcp.getConnectId() == this.getConnectId()) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/connection-active.svg");
        }

        if (EsConnectionNode.versionMap[this.uid]) {
            this.description = EsConnectionNode.versionMap[this.uid]
        } else {
            this.execute<any>('get /').then(res => {
                this.description=`version: ${res.version.number}`
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

        return [new EsIndexGroup(this),new QueryGroup(this)]

    }

    public copyName() {
        Util.copyToBoard(this.host)
    }

    public async deleteConnection(context: ExtensionContext) {

        Util.confirm(`Are you want to Delete Connection ${this.uid} ? `, async () => {
            this.indent({command:CommandKey.delete})
        })

    }

}