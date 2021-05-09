import { Global } from "@/common/global";
import * as path from "path";
import * as vscode from "vscode";
import { Constants, DatabaseType, ModelType } from "../../common/constants";
import { FileManager } from "../../common/filesManager";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { CopyAble } from "../interface/copyAble";
import { CommandKey, Node } from "../interface/node";
import { CatalogNode } from "./catalogNode";
import { SchemaNode } from "./schemaNode";
import { UserGroup } from "./userGroup";

/**
 * TODO: 切换为使用连接池, 现在会导致消费队列不正确, 导致视图失去响应
 */
export class ConnectionNode extends Node implements CopyAble {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/server.png");
    public contextValue: string = ModelType.CONNECTION;
    constructor(readonly key: string, readonly parent: Node) {
        super(key)
        this.init(parent)
        this.label = (this.usingSSH) ? `${this.ssh.host}@${this.ssh.port}` : `${this.host}@${this.port}`;
        this.cacheSelf()
        if (parent.name) {
            this.description = parent.name
            this.name = parent.name
        }
        if (this.disable) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.iconPath = path.join(Constants.RES_PATH, "icon/close.svg");
            return;
        }
        const lcp = ConnectionManager.activeNode;
        if (this.isActive(lcp)) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/connection-active.svg");
            this.description = `${parent.name ? parent.name + " " : ""}Active`
            return;
        }
        if (this.dbType == DatabaseType.PG) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/pg_server.svg");
        } else if (this.dbType == DatabaseType.MSSQL) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/mssql_server.png");
        }
        this.getChildren()
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let dbNodes = DatabaseCache.getSchemaListOfConnection(this.uid);
        if (dbNodes && !isRresh) {
            // update active state.
            return dbNodes.map(dbNode => {
                if (dbNode.contextValue == ModelType.USER_GROUP) {
                    return new UserGroup(dbNode.label, this)
                } else if (dbNode.contextValue == ModelType.CATALOG) {
                    return new CatalogNode(dbNode.label, this)
                }
                return new SchemaNode(dbNode.label, this)
            });
        }

        const hasCatalog = this.dbType != DatabaseType.MYSQL && this.contextValue == ModelType.CONNECTION;
        const sql = hasCatalog ? this.dialect.showDatabases() : this.dialect.showSchemas();
        return this.execute<any[]>(sql)
            .then((databases) => {
                const includeDatabaseArray = this.includeDatabases?.toLowerCase()?.split(",")
                const usingInclude = this.includeDatabases && includeDatabaseArray && includeDatabaseArray.length >= 1;
                const databaseNodes = databases.filter((db) => {
                    if (usingInclude  && !db.schema) {
                        return includeDatabaseArray.indexOf(db.Database.toLocaleLowerCase()) != -1;
                    }
                    return true;
                }).map<SchemaNode | CatalogNode>((database) => {
                    return hasCatalog ?
                        new CatalogNode(database.Database, this)
                        : new SchemaNode(database.schema || database.Database, this);
                });

                if (Global.getConfig("showUser") && !hasCatalog) {
                    databaseNodes.unshift(new UserGroup("USER", this));
                }
                DatabaseCache.setSchemaListOfConnection(this.uid, databaseNodes);

                return databaseNodes;
            })
    }

    public copyName() {
        Util.copyToBoard(this.host)
    }

    public async newQuery() {

        await FileManager.show(`${new Date().getTime()}.sql`);
        let childMap = {};
        const dbNameList = (await this.getChildren()).filter((databaseNode) => !(databaseNode instanceof UserGroup)).map((databaseNode) => {
            childMap[databaseNode.uid] = databaseNode
            return databaseNode.schema
        });
        let dbName: string;
        if (dbNameList.length == 1) {
            dbName = dbNameList[0]
        }
        if (dbNameList.length > 1) {
            dbName = await vscode.window.showQuickPick(dbNameList, { placeHolder: "active database" })
        }
        if (dbName) {
            ConnectionManager.changeActive(childMap[`${this.getConnectId()}_${dbName}`])
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

        Util.confirm(`Are you want to Delete Connection ${this.label} ? `, async () => {
            this.indent({ command: CommandKey.delete })
        })

    }

    public static init() { }


}
