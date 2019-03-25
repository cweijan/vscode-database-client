import * as path from "path";
import * as vscode from "vscode";
import mysqldump from 'mysqldump'
import { AppInsightsClient } from "../common/appInsightsClient";
import { Global } from "../common/Global";
import { QueryUnit } from "../database/QueryUnit";
import { InfoNode } from "./infoNode";
import { INode } from "./INode";
import { TableNode } from "./tableNode";
import { DatabaseCache } from "../database/DatabaseCache";
import { ModelType } from "../common/Constants";
import { OutputChannel } from "../common/outputChannel";
import { IConnection } from "./connection";
import { ConnectionManager } from "../database/ConnectionManager";

export class DatabaseNode implements INode, IConnection {

    identify: string;
    type: string = ModelType.DATABASE;
    constructor(readonly host: string, readonly user: string,
        readonly password: string, readonly port: string, readonly database: string,
        readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {

        this.identify = `${this.host}_${this.port}_${this.user}_${this.database}`
        return {
            label: this.database,
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: "database",
            iconPath: path.join(__filename, "..", "..", "..", "resources", "database.svg")
        }

    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {

        return QueryUnit.queryPromise<any[]>(ConnectionManager.getConnection(this), `SELECT TABLE_NAME FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${this.database}' LIMIT ${QueryUnit.maxTableCount}`)
            .then((tables) => {
                let tableNodes = DatabaseCache.getTableListOfDatabase(this.database)
                if (tableNodes && tableNodes.length > 1 && !isRresh) {
                    return tableNodes
                }

                tableNodes = tables.map<TableNode>((table) => {
                    let tableNode = new TableNode(this.host, this.user, this.password, this.port, this.database, table.TABLE_NAME, this.certPath)
                    return tableNode;
                })
                DatabaseCache.setTableListOfDatabase(this.database, tableNodes)
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public backupData(exportPath: string) {

        OutputChannel.appendLine(`Doing backup ${this.host}_${this.database}...`)
        mysqldump({
            connection: {
                host: this.host,
                user: this.user,
                password: this.password,
                database: this.database,
                port: parseInt(this.port)
            },
            dump: {
                schema: {
                    table: {
                        ifNotExist: false,
                        dropIfExist: true,
                        charset: false
                    },
                    engine: false
                }
            },
            dumpToFile: `${exportPath}\\${this.database}_${this.host}.sql`
        }).then(() => {
            vscode.window.showInformationMessage(`Backup ${this.host}_${this.database} success!`)
        }).catch((err) => {
            vscode.window.showErrorMessage(`Backup ${this.host}_${this.database} fail!\n${err}`)
        })
        OutputChannel.appendLine("backup end.")

    }

    deleteDatatabase() {
        vscode.window.showInputBox({ prompt: `Are you want to Delete Database ${this.database} ?     `, placeHolder: 'Input y to confirm.' }).then(inputContent => {
            if (inputContent.toLocaleLowerCase() == 'y') {
                QueryUnit.queryPromise(ConnectionManager.getConnection(this), `delete database ${this.database}`).then(() => {
                    Global.sqlTreeProvider.refresh()
                    DatabaseCache.storeCurrentCache()
                    vscode.window.showInformationMessage(`Delete database ${this.database} success!`)
                })
            }
        })
    }


    public async newQuery() {

        AppInsightsClient.sendEvent("newQuery", { viewItem: "database" });
        QueryUnit.createSQLTextDocument();

    }
}
