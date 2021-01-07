import * as path from "path";
import * as vscode from "vscode";
import { CacheKey, Constants, ModelType } from "../../common/constants";
import { FileManager } from "../../common/filesManager";
import { Console } from "../../common/Console";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ConnectionManager } from "../../service/connectionManager";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { DatabaseNode } from "./databaseNode";
import { UserGroup } from "./userGroup";
import { CopyAble } from "../interface/copyAble";
import { NodeUtil } from "../nodeUtil";
import { IConnection } from "@/service/connect/connection";

export class ConnectionNode extends Node implements CopyAble {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/server.png");
    public contextValue: string = ModelType.CONNECTION;
    constructor(readonly uid: string, readonly parent: Node) {
        super(uid)
        this.init(parent)
        this.cacheSelf()
        this.uid=this.getConnectId()
        if (parent.name) {
            this.label = `${parent.name}_${this.uid}`
            this.name = parent.name
        }
        const lcp = ConnectionManager.getLastConnectionOption(false);
        if (lcp && lcp.getConnectId() == this.getConnectId()) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/connection-active.svg");
            this.description = `Active`
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let connection: IConnection;
        try {
            connection = await ConnectionManager.getConnection(this);
        } catch (err) {
            return [new InfoNode(err)];
        }

        return QueryUnit.queryPromise<any[]>(connection, this.dialect.showDatabases())
            .then((databases) => {
                const databaseNodes = databases.filter((db) => {

                    if (this.includeDatabases) {
                        for (const includeDatabase of this.includeDatabases.split(",")) {
                            if (db.Database == includeDatabase.trim()) { return true; }
                        }
                        return false;
                    }

                    if (this.excludeDatabases) {
                        for (const excludeDatabase of this.excludeDatabases.split(",")) {
                            if (db.Database == excludeDatabase.trim()) { return false; }
                        }
                    }
                    return true;
                }).map<DatabaseNode>((database) => {
                    return new DatabaseNode(database.Database, this);
                });

                if (this.user.toLocaleLowerCase() == "root") {
                    // databaseNodes.unshift(new UserGroup("USER", this));
                }

                DatabaseCache.setDataBaseListOfConnection(this.uid, databaseNodes);

                return databaseNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public copyName() {
        Util.copyToBoard(this.host)
    }

    public async newQuery() {

        const key = `${this.getConnectId()}`;
        await FileManager.show(`${key}.sql`);
        const dbNameList = DatabaseCache.getDatabaseListOfConnection(key).filter((databaseNode) => !(databaseNode instanceof UserGroup)).map((databaseNode) => databaseNode.database);
        let dbName;
        if (dbNameList.length == 1) {
            dbName = dbNameList[0]
        }
        if (dbNameList.length > 1) {
            dbName = await vscode.window.showQuickPick(dbNameList, { placeHolder: "active database" })
        }
        if (dbName) {
            await ConnectionManager.getConnection({
                ...this, database: dbName
            } as Node, true);
        }

    }

    public createDatabase() {
        vscode.window.showInputBox({ placeHolder: 'Input you want to create new database name.' }).then(async (inputContent) => {
            if (!inputContent) { return; }
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), this.dialect.createDatabase(inputContent)).then(() => {
                DatabaseCache.clearDatabaseCache(this.uid);
                DbTreeDataProvider.refresh(this);
                vscode.window.showInformationMessage(`create database ${inputContent} success!`);
            });
        });
    }

    public async deleteConnection(context: vscode.ExtensionContext) {

        Util.confirm(`Are you want to Delete Connection ${this.uid} ? `, async () => {
            const targetContext = this.global === false ? context.workspaceState : context.globalState;
            const connections = targetContext.get<{ [key: string]: Node }>(CacheKey.ConectionsKey);
            ConnectionManager.removeConnection(this.uid)
            DatabaseCache.clearDatabaseCache(this.uid)
            delete connections[this.uid];
            await targetContext.update(CacheKey.ConectionsKey, NodeUtil.removeParent(connections));
            DbTreeDataProvider.refresh();
        })

    }

    public static init() { }


}
