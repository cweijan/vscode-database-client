import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType, Template } from "../../common/constants";
import { Util } from "../../common/util";
import { ConnectionManager } from "../../service/connectionManager";
import { QueryUnit } from "../../service/queryUnit";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { InfoNode } from "../other/infoNode";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { DatabaseNode } from "./databaseNode";
import { FileManager, FileModel } from "@/common/filesManager";
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
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), this.dialect.showUsers())
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

        ConnectionManager.getConnection(this, true);
        const filePath = await FileManager.record(`${this.parent.uid}#create-view-template.sql`,`CREATE USER 'username'@'%' IDENTIFIED BY 'password';`, FileModel.WRITE)
        FileManager.show(filePath)
    }

}


