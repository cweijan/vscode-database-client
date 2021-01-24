import { Global } from "@/common/global";
import * as path from "path";
import * as vscode from "vscode";
import { CacheKey, ConfigKey, Constants, DatabaseType, ModelType } from "../../common/constants";
import { FileManager } from "../../common/filesManager";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { NodeUtil } from "../nodeUtil";
import { InfoNode } from "../other/infoNode";
import { DatabaseNode } from "./databaseNode";
import { UserGroup } from "./userGroup";

/**
 * TODO: 切换为使用连接池, 现在会导致消费队列不正确, 导致视图失去响应
 */
export class ConnectionNode extends Node implements CopyAble {

    private static initMark = {}
    public iconPath: string = path.join(Constants.RES_PATH, "icon/server.png");
    public contextValue: string = ModelType.CONNECTION;
    constructor(readonly uid: string, readonly parent: Node) {
        super(uid)
        this.init(parent)
        this.cacheSelf()
        this.uid = this.getConnectId()
        if (parent.name) {
            this.label = `${parent.name}_${this.uid}`
            this.name = parent.name
        }
        if (this.dbType == DatabaseType.PG) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/pg_server.svg");
        } else if (this.dbType == DatabaseType.MSSQL) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/mssql_server.png");
        }
        const lcp = ConnectionManager.getLastConnectionOption(false);
        if (lcp && lcp.getConnectId() == this.getConnectId()) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/connection-active.svg");
            this.description = `Active`
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let dbNodes = DatabaseCache.getDatabaseListOfConnection(this.uid);
        if (dbNodes && !isRresh) {
            // update active state.
            return dbNodes.map(dbNode => {
                if (dbNode.contextValue == ModelType.USER_GROUP) {
                    return new UserGroup(dbNode.label, this)
                }
                return new DatabaseNode(dbNode.label, this)
            });
        }

        return this.execute<any[]>(this.dialect.showDatabases())
            .then((databases) => {
                const includeDatabaseArray = this.includeDatabases?.toLowerCase()?.split(",")
                const usingInclude = includeDatabaseArray && includeDatabaseArray.length > 1;
                const databaseNodes = databases.filter((db) => {
                    if(usingInclude && includeDatabaseArray.indexOf(db?.Database?.toLocaleLowerCase())==-1){
                        return false;
                    }
                    return true;
                }).map<DatabaseNode>((database) => {
                    return new DatabaseNode(database.Database, this);
                });

                if (!ConnectionNode.initMark[this.uid] && Global.getConfig<boolean>(ConfigKey.LOAD_META_ON_CONNECT)) {
                    for (const databaseNode of databaseNodes) {
                        for (const groupNode of databaseNode.getChildren() as Node[]) {
                            groupNode.getChildren(true);
                        }
                    }
                }

                databaseNodes.unshift(new UserGroup("USER", this));
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
            this.execute(this.dialect.createDatabase(inputContent)).then(() => {
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
