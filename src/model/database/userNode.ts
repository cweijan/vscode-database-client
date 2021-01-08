import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ConnectionManager } from "../../service/connectionManager";
import { QueryUnit } from "../../service/queryUnit";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";

export class UserNode extends Node implements CopyAble {

    public contextValue = ModelType.USER;
    public iconPath = path.join(Constants.RES_PATH, "icon/user2.png")
    constructor(readonly username: string,readonly host:string, readonly parent: Node) {
        super(username)
        this.init(parent)
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
                DbTreeDataProvider.refresh(this.parent);
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
