import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/Constants";
import { ConnectionManager } from "../../database/ConnectionManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { IConnection } from "../Connection";
import { InfoNode } from "../InfoNode";
import { INode } from "../INode";
import { DatabaseNode } from "./databaseNode";
import { MySQLTreeDataProvider } from "../../provider/MysqlTreeDataProvider";

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
        let userNodes =[]
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT DISTINCT USER FROM mysql.user;`)
            .then((tables) => {
                userNodes = tables.map<UserNode>((table) => {
                    return new UserNode(this.host, this.user, this.password, this.port, table.USER, this.certPath)
                })
                return userNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    createTemplate() {
        ConnectionManager.getConnection(this, true)
        QueryUnit.createSQLTextDocument(`CREATE USER 'username'@'host' IDENTIFIED BY 'password';`)
    }

}


export class UserNode implements INode, IConnection {
    type: string;
    identify: string;
    constructor(readonly host: string, readonly user: string, readonly password: string,
        readonly port: string, readonly name: string,
        readonly certPath: string) {
    }
    public getTreeItem(): vscode.TreeItem {
        this.identify = `${this.host}_${this.port}_${this.name}`
        return {
            label: this.name,
            contextValue: ModelType.USER,
            iconPath: path.join(Constants.RES_PATH, "user.svg"),
            command: {
                command: "mysql.user.sql",
                title: "Run User Detail Statement",
                arguments: [this, true]
            }
        };
    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {
        return [];
    }

    public async selectSqlTemplate() {
        const sql = `SELECT USER 0USER,HOST 1HOST,Super_priv,Select_priv,Insert_priv,Update_priv,Delete_priv,Create_priv,Drop_priv,Index_priv,Alter_priv FROM mysql.user where user='${this.name}';`;
        QueryUnit.runQuery(sql, this);
    }

    public drop() {
        ConnectionManager.getConnection(this,true)
        vscode.window.showInputBox({ prompt: `Are you want to drop user ${this.user} ?     `, placeHolder: 'Input y to confirm.' }).then(async inputContent => {
            if (inputContent.toLocaleLowerCase() == 'y') {
                QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP user ${this.name}`).then(() => {
                    MySQLTreeDataProvider.refresh()
                    vscode.window.showInformationMessage(`Drop user ${this.name} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel drop user ${this.name}!`)
            }
        })
    }

    changePasswordTemplate() {
        ConnectionManager.getConnection(this, true)
        QueryUnit.createSQLTextDocument(`update mysql.user set password=PASSWORD("newPassword") where User='${this.name}';\nFLUSH PRIVILEGES;\n-- since mysql version 5.7, password column need change to authentication_string=PASSWORD("test")`);
    }

}