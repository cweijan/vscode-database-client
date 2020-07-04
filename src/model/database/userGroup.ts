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

export class UserGroup extends DatabaseNode {

    public contextValue: string = ModelType.USER_GROUP;
    public iconPath = path.join(Constants.RES_PATH, "icon/userGroup.svg")
    constructor(readonly name: string, readonly info: Node) {
        super(name, info)
        this.id = `${this.getConnectId()}_${ModelType.USER_GROUP}`;
        this.database = null
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        let userNodes = [];
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT DISTINCT USER FROM mysql.user;`)
            .then((tables) => {
                userNodes = tables.map<UserNode>((table) => {
                    return new UserNode(table.USER, this.info);
                });
                return userNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public createTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.showSQLTextDocument(`CREATE USER 'username'@'%' IDENTIFIED BY 'password';`, Template.create);
    }

}


export class UserNode extends Node implements CopyAble {

    public contextValue = ModelType.USER;
    public iconPath = path.join(Constants.RES_PATH, "icon/user.svg")
    constructor(readonly username: string, readonly info: Node) {
        super(username)
        this.init(info)
        this.command = {
            command: "mysql.user.sql",
            title: "Run User Detail Statement",
            arguments: [this, true],
        }
    }

    public copyName(): void {
        Util.copyToBoard(this.username)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }

    public async selectSqlTemplate() {
        const sql = `SELECT USER 0USER,HOST 1HOST,Super_priv,Select_priv,Insert_priv,Update_priv,Delete_priv,Create_priv,Drop_priv,Index_priv,Alter_priv FROM mysql.user where user='${this.username}';`;
        QueryUnit.runQuery(sql, this);
    }

    public drop() {

        Util.confirm(`Are you want to drop user ${this.username} ?`, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP user ${this.username}`).then(() => {
                DbTreeDataProvider.refresh();
                vscode.window.showInformationMessage(`Drop user ${this.username} success!`);
            });
        })
    }

    public grandTemplate() {
        QueryUnit.showSQLTextDocument(`
GRANT ALL PRIVILEGES ON *.* to '${this.username}'@'%'
`.replace(/^\s/, ""));
    }

    public changePasswordTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.showSQLTextDocument(`
update
    mysql.user
set
    password = PASSWORD("newPassword")
where
    User = '${this.username}';
FLUSH PRIVILEGES;
-- since mysql version 5.7, password column need change to authentication_string=PASSWORD("test")`
            .replace(/^\s/, ""));
    }

}