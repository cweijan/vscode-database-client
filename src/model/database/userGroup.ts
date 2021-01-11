import * as path from "path";
import { Constants, ModelType } from "../../common/constants";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { DatabaseNode } from "./databaseNode";
import { UserNode } from "./userNode";

export class UserGroup extends DatabaseNode {

    public contextValue: string = ModelType.USER_GROUP;
    public iconPath = path.join(Constants.RES_PATH, "icon/userGroup.svg")
    constructor(readonly name: string, readonly parent: Node) {
        super(name, parent)
        this.uid = `${this.getConnectId()}_${ModelType.USER_GROUP}`;
        this.database = parent.database
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        let userNodes = [];
        return this.execute<any[]>(this.dialect.showUsers())
            .then((tables) => {
                userNodes = tables.map<UserNode>((table) => {
                    return new UserNode(table.user,table.host, this.parent);
                });
                return userNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, `CREATE USER 'username'@'%' IDENTIFIED BY 'password';`, 'create-user-template.sql')

    }

}


