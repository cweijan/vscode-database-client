import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/Constants";
import { DatabaseCache } from "../../database/DatabaseCache";
import { IConnection } from "../Connection";
import { INode } from "../INode";
import { DatabaseNode } from "./databaseNode";
import { TableNode } from "../table/tableNode";
import { ConnectionManager } from "../../database/ConnectionManager";
import { QueryUnit } from "../../database/QueryUnit";
import { InfoNode } from "../InfoNode";
import { Util } from "../../common/util";

export class UserGroup extends DatabaseNode {

    identify: string;
    type: string = ModelType.DATABASE;
    constructor(readonly host: string, readonly user: string,
        readonly password: string, readonly port: string, readonly database: string,
        readonly certPath: string) {
        super(host, user, password, port, database, certPath);
    }

    public getTreeItem(): vscode.TreeItem {

        this.identify = `${this.host}_${this.port}_${this.user}_${ModelType.USER_GROUP}`
        return {
            label: "USER",
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.USER_GROUP,
            iconPath: path.join(Constants.RES_PATH, "user.svg")
        }

    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {
        let userNodes = DatabaseCache.getTableListOfDatabase(this.identify)
        if (userNodes && !isRresh) {
            return userNodes
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT USER,HOST FROM mysql.user;`)
            .then((tables) => {
                userNodes = Util.trim(tables,'USER').map<UserNode>((table) => {
                    return new UserNode(this.host, this.user, this.password, this.port, this.database, table.USER, this.certPath)
                })
                DatabaseCache.setTableListOfDatabase(this.identify, userNodes)
                return userNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });

    }

}


export class UserNode extends TableNode {
    public getTreeItem(): vscode.TreeItem {

        this.identify = `${this.host}_${this.port}_${this.table}`
        return {
            label: this.table,
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.USER,
            iconPath: path.join(Constants.RES_PATH, "user.svg")
            // command: {
            //     command: "mysql.template.sql",
            //     title: "Run Select Statement",
            //     arguments: [this, true]
            // }
        };

    }
}