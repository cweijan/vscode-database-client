import * as path from "path";
import { Constants, ModelType, Template } from "../../common/constants";
import { ConnectionManager } from "../../service/connectionManager";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { InfoNode } from "../other/infoNode";
import { Node } from "../interface/node";
import { ProcedureNode } from "./procedure";

export class ProcedureGroup extends Node  {
    
    public contextValue = ModelType.PROCEDURE_GROUP
    public iconPath = path.join(Constants.RES_PATH, "icon/procedure.png")
    constructor(readonly info: Node) {
        super("PROCEDURE")
        this.id = `${info.getConnectId()}_${info.database}_${ModelType.PROCEDURE_GROUP}`;
        this.init(info)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = DatabaseCache.getTableListOfDatabase(this.id);
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT ROUTINE_NAME FROM information_schema.routines WHERE ROUTINE_SCHEMA = '${this.database}' and ROUTINE_TYPE='PROCEDURE'`)
            .then((tables) => {
                tableNodes = tables.map<Node>((table) => {
                    return new ProcedureNode(table.ROUTINE_NAME, this.info);
                });
                DatabaseCache.setTableListOfDatabase(this.id, tableNodes);
                if (tableNodes.length == 0) {
                    return [new InfoNode("This database has no procedure")];
                }
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public createTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.showSQLTextDocument(`CREATE
/*[DEFINER = { user | CURRENT_USER }]*/
PROCEDURE [name]()
BEGIN

END;`, Template.create);
    }

}