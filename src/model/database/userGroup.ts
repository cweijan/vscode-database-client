import { DatabaseCache } from "@/service/common/databaseCache";
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
        this.init(parent)
        // fix switch database fail.
        this.database = null
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        let userNodes = DatabaseCache.getChildListOfId(this.uid);
        if (userNodes && !isRresh) {
            return userNodes;
        }
        return this.execute<any[]>(this.dialect.showUsers())
            .then((tables) => {
                userNodes = tables.map<UserNode>((table) => {
                    return new UserNode(table.user, table.host, this);
                });
                DatabaseCache.setChildListOfDatabase(this.uid, userNodes);
                return userNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.createUser(), 'create-user-template.sql')

    }

}


