import * as path from "path";
import { Constants, ModelType } from "../../common/constants";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { ProcedureNode } from "./procedure";

export class ProcedureGroup extends Node {

    public contextValue = ModelType.PROCEDURE_GROUP
    public iconPath = path.join(Constants.RES_PATH, "icon/procedure.png")
    constructor(readonly parent: Node) {
        super("PROCEDURE")
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getChildCache(this.uid);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return this.execute<any[]>(this.dialect.showProcedures(this.database))
            .then((tables) => {
                tableNodes = tables.map<Node>((table) => {
                    return new ProcedureNode(table.ROUTINE_NAME, this);
                });
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This database has no procedure")];
                }
                DatabaseCache.setChildCache(this.uid, tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.procedureTemplate(), 'create-procedure-template.sql')

    }

}
