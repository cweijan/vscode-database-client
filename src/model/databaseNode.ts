import * as path from "path";
import * as vscode from "vscode";
import mysqldump from 'mysqldump'
import { QueryUnit } from "../database/QueryUnit";
import { InfoNode } from "./InfoNode";
import { INode } from "./INode";
import { TableNode } from "./TableNode";
import { DatabaseCache } from "../database/DatabaseCache";
import { ModelType } from "../common/Constants";
import { Console } from "../common/OutputChannel";
import { IConnection } from "./Connection";
import { ConnectionManager } from "../database/ConnectionManager";
import { MySQLTreeDataProvider } from "../provider/MysqlTreeDataProvider";

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
            contextValue: ModelType.DATABASE,
            iconPath: path.join(__filename, "..", "..", "..", "resources", "database.svg")
        }

    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {

        let tableNodes = DatabaseCache.getTableListOfDatabase(this.identify)
        if (tableNodes && !isRresh) {
            return tableNodes
        }
        return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT TABLE_NAME FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${this.database}' LIMIT ${QueryUnit.maxTableCount}`)
            .then((tables) => {
                tableNodes = tables.map<TableNode>((table) => {
                    let tableNode = new TableNode(this.host, this.user, this.password, this.port, this.database, table.TABLE_NAME, this.certPath)
                    return tableNode;
                })
                DatabaseCache.setTableListOfDatabase(this.identify, tableNodes)
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public backupData(exportPath: string) {

        Console.log(`Doing backup ${this.host}_${this.database}...`)
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
        Console.log("backup end.")

    }

    deleteDatatabase( sqlTreeProvider: MySQLTreeDataProvider) {
        vscode.window.showInputBox({ prompt: `Are you want to Delete Database ${this.database} ?     `, placeHolder: 'Input y to confirm.' }).then(async inputContent => {
            if (inputContent.toLocaleLowerCase() == 'y') {
                QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP DATABASE ${this.database}`).then(() => {
                    DatabaseCache.clearDatabaseCache(`${this.host}_${this.port}_${this.user}`)
                    sqlTreeProvider.refresh()
                    vscode.window.showInformationMessage(`Delete database ${this.database} success!`)
                })
            }else{
                vscode.window.showInformationMessage(`Cancel delete database ${this.database}!`)
            }
        })
    }


    public async newQuery() {

        QueryUnit.createSQLTextDocument();

    }
}
