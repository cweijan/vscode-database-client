import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/Constants";
import { ConnectionManager } from "../../database/ConnectionManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { ConnectionInfo } from "../interface/connection";
import { InfoNode } from "../InfoNode";
import { Node } from "../interface/node";
import { DatabaseNode } from "./databaseNode";
import { MySQLTreeDataProvider } from "../../provider/MysqlTreeDataProvider";
import { CopyAble } from "../interface/copyAble";
import { Util } from "../../common/util";

export class UserGroup extends DatabaseNode {

    public id: string;
    public type: string = ModelType.DATABASE;
    constructor(readonly host: string, readonly user: string,
        readonly password: string, readonly port: string, readonly database: string,
        readonly certPath: string) {
        super(host, user, password, port, database, certPath);
    }

    public getTreeItem(): vscode.TreeItem {

        this.id = `${this.host}_${this.port}_${this.user}_${ModelType.USER_GROUP}`;
        return {
            label: "USER",
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.USER_GROUP,
            iconPath: path.join(Constants.RES_PATH, "user.svg"),
        };

    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        let userNodes = [];
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT DISTINCT USER FROM mysql.user;`)
            .then((tables) => {
                userNodes = tables.map<UserNode>((table) => {
                    return new UserNode(this.host, this.user, this.password, this.port, table.USER, this.certPath);
                });
                return userNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public createTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.showSQLTextDocument(`CREATE USER 'username'@'%' IDENTIFIED BY 'password';`);
    }

}


export class UserNode implements Node, ConnectionInfo, CopyAble {

    public type: string;
    public id: string;
    constructor(readonly host: string, readonly user: string, readonly password: string,
        readonly port: string, readonly name: string,
        readonly certPath: string) {
    }
    public copyName(): void {
        Util.copyToBoard(this.name)
    }
    public getTreeItem(): vscode.TreeItem {
        this.id = `${this.host}_${this.port}_${this.name}`;
        return {
            label: this.name,
            contextValue: ModelType.USER,
            iconPath: path.join(Constants.RES_PATH, "user.svg"),
            command: {
                command: "mysql.user.sql",
                title: "Run User Detail Statement",
                arguments: [this, true],
            },
        };
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }

    public async selectSqlTemplate() {
        const sql = `SELECT USER 0USER,HOST 1HOST,Super_priv,Select_priv,Insert_priv,Update_priv,Delete_priv,Create_priv,Drop_priv,Index_priv,Alter_priv FROM mysql.user where user='${this.name}';`;
        QueryUnit.runQuery(sql, this);
    }

    public drop() {

        Util.confirm(`Are you want to drop user ${this.user} ?`, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP user ${this.name}`).then(() => {
                MySQLTreeDataProvider.refresh();
                vscode.window.showInformationMessage(`Drop user ${this.name} success!`);
            });
        })
    }

    public grandTemplate() {
        QueryUnit.showSQLTextDocument(`
GRANT ALL PRIVILEGES ON *.* to '${this.name}'@'%'
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
    User = '${this.name}';
FLUSH PRIVILEGES;
-- since mysql version 5.7, password column need change to authentication_string=PASSWORD("test")`
            .replace(/^\s/, ""));
    }

}