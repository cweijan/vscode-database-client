import { Node } from "@/model/interface/node";
import { TableGroup } from "@/model/main/tableGroup";
import { QueryUnit } from "@/service/queryUnit";
import { ThemeIcon } from "vscode";
import { ESIndexNode } from "./esIndexNode";

export class EsIndexGroup extends TableGroup {
    public iconPath = new ThemeIcon("type-hierarchy");
    constructor(readonly parent: Node) {
        super(parent)
        this.label = "Index"
    }

    async getChildren(): Promise<Node[]> {
        return this.execute(`get /_cat/indices`).then((res: string) => {
            let indexes = [];
            const results = res.match(/[^\r\n]+/g);
            for (const result of results) {
                indexes.push(new ESIndexNode(result, this))
            }
            return indexes;
        })
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.tableTemplate(), 'create-index-template.es')

    }

}