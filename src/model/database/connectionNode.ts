import { Console } from "@/common/Console";
import { Global } from "@/common/global";
import * as path from "path";
import * as vscode from "vscode";
import { ConfigKey, Constants, DatabaseType, ModelType } from "../../common/constants";
import { FileManager } from "../../common/filesManager";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { CopyAble } from "../interface/copyAble";
import { CommandKey, Node } from "../interface/node";
import { TableGroup } from "../main/tableGroup";
import { ViewGroup } from "../main/viewGroup";
import { CatalogNode } from "./catalogNode";
import { SchemaNode } from "./schemaNode";
import { UserGroup } from "./userGroup";

/**
 * TODO: 切换为使用连接池, 现在会导致消费队列不正确, 导致视图失去响应
 */
export class ConnectionNode extends Node implements CopyAble {

    private static versionMap = {}
    public iconPath: string | vscode.ThemeIcon = path.join(Constants.RES_PATH, "icon/server/mysql.svg");
    public contextValue: string = ModelType.CONNECTION;
    constructor(readonly key: string, readonly parent: Node) {
        super(key)
        this.init(parent)
        this.cacheSelf()
        this.getLabel(parent);
        this.bindToolTip()
        this.getIcon();
        this.getStatus();
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {


        if (this.dbType == DatabaseType.SQLITE) {
            return [new TableGroup(this), new ViewGroup(this)];
        }

        const key = this.contextValue == ModelType.CONNECTION ? this.key : this.uid;
        let dbNodes = DatabaseCache.getSchemaListOfConnection(key);
        if (dbNodes && !isRresh) {
            for (const dbNode of dbNodes) {
                dbNode?.checkActive();
            }
            return dbNodes;
        }

        const hasCatalog = this.dbType != DatabaseType.MYSQL && this.contextValue == ModelType.CONNECTION;
        const sql = hasCatalog ? this.dialect.showDatabases() : this.dialect.showSchemas();
        return this.execute<any[]>(sql)
            .then((databases) => {
                const includeDatabaseArray = this.includeDatabases?.toLowerCase()?.split(",")
                const usingInclude = this.includeDatabases && includeDatabaseArray && includeDatabaseArray.length >= 1;
                const databaseNodes = databases.filter((db) => {
                    if (usingInclude && !db.schema) {
                        return includeDatabaseArray.indexOf(db.Database.toLowerCase()) != -1;
                    }
                    if (this.hideSystemSchema) {
                        if (this.dbType == DatabaseType.MYSQL && ["performance_schema", "information_schema", "sys", "mysql"].includes(db.Database.toLowerCase()) ||
                            this.dbType == DatabaseType.PG && db.schema && ["pg_toast", "information_schema", "pg_catalog"].includes(db.schema.toLowerCase())) {
                            return false;
                        }
                    }
                    return true;
                }).map<SchemaNode | CatalogNode>((database) => {
                    return hasCatalog ?
                        new CatalogNode(database.Database, this)
                        : new SchemaNode(database.schema || database.Database, database, this);
                });

                if (Global.getConfig("showUser") && !hasCatalog) {
                    databaseNodes.unshift(new UserGroup("USER", this));
                }
                DatabaseCache.setSchemaListOfConnection(key, databaseNodes);

                return databaseNodes;
            })
    }


    private getStatus() {
        if (this.disable) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.description = (this.description || '') + " closed"
            return;
        }
        const version = ConnectionNode.versionMap[this.key]
        if (version) {
            this.description = (this.description || '') + " " + version
        }
        this.fetchInfo();
    }

    private getLabel(parent: Node) {
        if (parent.name) {
            this.name = parent.name;
            const preferName = Global.getConfig(ConfigKey.PREFER_CONNECTION_NAME, true);
            if (preferName) {
                this.label = parent.name
                return;
            }
            this.description = parent.name;
        }


        if (this.dbType == DatabaseType.SQLITE) {
            const baseName=path.basename(this.dbPath);
            let prefix=path.resolve(baseName,"..")
            if(prefix.length>10){
                prefix=prefix.substring(0,10)+"..."
            }
            this.label = prefix+path.sep+baseName;
            return;
        }

        this.label = (this.usingSSH) ? `${this.ssh.host}@${this.ssh.port}` : `${this.host}@${this.instanceName ? this.instanceName : this.port}`;
        if (this.label.length > 20) {
            this.label = this.label.substring(0, 20) + "..."
        }
    }

    private bindToolTip() {
        if (this.parent.name) {
            this.tooltip = `Host: ${this.host}, Port: ${this.port}`;
        }
    }


    private async fetchInfo() {
        if (ConnectionNode.versionMap[this.key]) return;
        const versionSql = this.dialect.showVersion()
        if (!versionSql) return;
        try {
            const version = (await this.execute(versionSql))[0]?.server_version
            ConnectionNode.versionMap[this.key] = version
            this.description = (this.description || '') + " " + version
        } catch (error) {
            Console.log(error)
        }
        try {
            // Help sql auto complection
            await this.getChildren();
        } catch (error) {
            Console.log(error);
        }
        DbTreeDataProvider.refresh(this)

    }

    /**
     * herlper site:
     * - https://www.iloveimg.com/zh-cn/resize-image/resize-svg
     * - https://vectorpaint.yaks.co.nz/
     */
    private getIcon() {
        const basePath = Constants.RES_PATH + "/icon/server/";
        const isActive = ConnectionManager.activeNode?.key == this.key;

        switch (this.dbType) {
            case DatabaseType.MYSQL:
                this.iconPath = basePath + (isActive ? "mysql_active.svg" : "mysql.svg");
                break;
            case DatabaseType.PG:
                this.iconPath = basePath + (isActive ? "pgsql_active.svg" : "pgsql.svg");
                break;
            case DatabaseType.MSSQL:
                this.iconPath = basePath + (isActive ? "mssql.png" : "mssql.png");
                break;
            case DatabaseType.SQLITE:
                this.iconPath = basePath + (isActive ? "sqlite_active.svg" : "sqlite.svg");
                break;
            case DatabaseType.MONGO_DB:
                this.iconPath = basePath + (isActive ? "mongo_active.svg" : "mongo.svg");
                break;
        }
    }

    public copyName() {
        Util.copyToBoard(this.host)
    }

    public createDatabase() {
        FileManager.showSQLTextDocument(this, this.dialect.createDatabase(''), 'create-db-template.sql')
    }

    public async deleteConnection(context: vscode.ExtensionContext) {

        Util.confirm(`Are you want to delete Connection ${this.label} ? `, async () => {
            this.indent({ command: CommandKey.delete })
        })

    }

    public static init() {

        const userName: string = require('os')?.userInfo()?.username?.toLowerCase();
        if (!userName) return;

        if (userName.includes("fen") || userName.includes("guo")) {
            Global.updateConfig('showUgly', true)
        }

    }


}
