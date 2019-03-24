import * as path from "path";
import * as vscode from "vscode";
import mysqldump from 'mysqldump'
import { AppInsightsClient } from "../common/appInsightsClient";
import { Global } from "../common/global";
import { Utility } from "../common/utility";
import { ColumnNode } from "./columnNode";
import { InfoNode } from "./infoNode";
import { INode } from "./INode";
import { DatabaseCache } from "../common/DatabaseCache";
import { ModelType } from "../common/constants";
import { IConnection } from "./connection";
import { OutputChannel } from "../common/outputChannel";


export class TableNode implements INode {

    identify: string;
    type: string = ModelType.TABLE;

    constructor(readonly host: string, readonly user: string, private readonly password: string,
        readonly port: string, readonly database: string, readonly table: string,
        private readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        this.identify = `${this.host}_${this.port}_${this.user}_${this.database}_${this.table}`
        let item = new vscode.TreeItem(this.table);
        item.collapsibleState = DatabaseCache.getElementState(this)
        item.contextValue = "table"
        item.iconPath = path.join(__filename, "..", "..", "..", "resources", "table.svg")
        item.command = {
            command: "mysql.template.sql",
            title: "Select Node",
            arguments: [this, true]
        };
        return item;
    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {
        const connection = this.getConnection()

        return Utility.queryPromise<any[]>(connection, `SELECT * FROM information_schema.columns WHERE table_schema = '${this.database}' AND table_name = '${this.table}';`)
            .then((columns) => {

                let columnNodes = DatabaseCache.getColumnListOfTable(this.table)
                if (columnNodes && columnNodes.length > 0 && !isRresh) {
                    return columnNodes;
                }
                columnNodes = columns.map<ColumnNode>((column) => {
                    return new ColumnNode(this.host, this.user, this.password, this.port, this.database, this.table, this.certPath, column);
                })
                DatabaseCache.setColumnListOfTable(this.table, columnNodes)

                return columnNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    dropTable() {

        vscode.window.showInputBox({ prompt: `Are you want to drop table ${this.table} ?     `, placeHolder: 'Input y to confirm.' }).then(inputContent => {
            if (inputContent.toLocaleLowerCase() == 'y') {
                Utility.queryPromise(this.getConnection(), `drop table ${this.database}.${this.table}`).then(() => {
                    Global.sqlTreeProvider.refresh()
                    DatabaseCache.storeCurrentCache()
                    vscode.window.showInformationMessage(`Delete table ${this.table} success!`)
                })
            }
        })

    }


    truncateTable() {

        vscode.window.showInputBox({ prompt: `Are you want to clear table ${this.table} all data ?          `, placeHolder: 'Input y to confirm.' }).then(inputContent => {
            if (inputContent.toLocaleLowerCase() == 'y') {
                Utility.queryPromise(this.getConnection(), `truncate table ${this.database}.${this.table}`).then(() => {
                    vscode.window.showInformationMessage(`Clear table ${this.table} all data success!`)
                })
            }
        })


    }


    private getConnection(): IConnection {
        return Utility.createConnection({
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            database: this.database,
            certPath: this.certPath,
        });
    }

    public changeTableName() {

        const connection = this.getConnection()

        vscode.window.showInputBox({ value: this.table, placeHolder: 'newTableName', prompt: `You will changed ${this.database}.${this.table} to new table name!` }).then(newTableName => {
            if (!newTableName) return
            const sql = `alter table ${this.database}.${this.table} rename ${newTableName}`
            Utility.queryPromise(connection, sql).then((rows) => {
                DatabaseCache.getParentTreeItem(this, ModelType.TABLE).getChildren(true).then(() => {
                    Global.sqlTreeProvider.refresh()
                    DatabaseCache.storeCurrentCache()
                })
            })

        })

    }

    public async selectSqlTemplate(run: Boolean) {
        AppInsightsClient.sendEvent("selectSqlTemplate");
        const sql = `SELECT * FROM ${this.database}.${this.table} LIMIT 1000;`;

        if (run) {
            const connection = {
                host: this.host,
                user: this.user,
                password: this.password,
                port: this.port,
                database: this.database,
                certPath: this.certPath,
            };
            Global.activeConnection = connection;
            Utility.runQuery(sql, connection);
        } else {
            Utility.createSQLTextDocument(sql);
        }

    }

    public insertSqlTemplate() {
        this
            .getChildren()
            .then((children: INode[]) => {
                const childrenNames = children.map((child: any) => child.column.COLUMN_NAME);
                let sql = `insert into ${this.database}.${this.table}\n`
                sql += `(${childrenNames.toString().replace(/,/g, ", ")})\n`
                sql += "values\n"
                sql += `(${childrenNames.toString().replace(/,/g, ", ")});`
                Utility.createSQLTextDocument(sql);
            });
    }

    deleteSqlTemplate(): any {
        this
            .getChildren()
            .then((children: INode[]) => {
                const keysNames = children.filter((child: any) => child.column.COLUMN_KEY).map((child: any) => child.column.COLUMN_NAME);

                const where = keysNames.map((name: string) => `${name} = ${name}`);

                let sql = `delete from ${this.database}.${this.table} \n`;
                sql += `where ${where.toString().replace(/,/g, "\n   and ")}`
                Utility.createSQLTextDocument(sql)
            });
    }

    public updateSqlTemplate() {
        this
            .getChildren()
            .then((children: INode[]) => {
                const keysNames = children.filter((child: any) => child.column.COLUMN_KEY).map((child: any) => child.column.COLUMN_NAME);
                const childrenNames = children.filter((child: any) => !child.column.COLUMN_KEY).map((child: any) => child.column.COLUMN_NAME);

                const sets = childrenNames.map((name: string) => `${name} = ${name}`);
                const where = keysNames.map((name: string) => `${name} = ${name}`);

                let sql = `update ${this.database}.${this.table} \nset ${sets.toString().replace(/,/g, "\n  , ")}\n`;
                sql += `where ${where.toString().replace(/,/g, "\n   and ")}`
                Utility.createSQLTextDocument(sql)
            });
    }

    public backupData(exportPath: string) {

        OutputChannel.appendLine(`Doing backup ${this.host}_${this.database}_${this.table}...`)
        mysqldump({
            connection: {
                host: this.host,
                user: this.user,
                password: this.password,
                database: this.database,
                port:parseInt(this.port)
            },
            dump:{
                tables:[this.table],
                schema:{
                    table:{
                        ifNotExist:false,
                        dropIfExist:true,
                        charset:false
                    },
                    engine:false
                }
            },
            dumpToFile: `${exportPath}\\${this.database}.${this.table}_${this.host}.sql`
        }).then(()=>{
            vscode.window.showInformationMessage(`Backup ${this.host}_${this.database}_${this.table} success!`)
        }).catch((err)=>{
            vscode.window.showErrorMessage(`Backup ${this.host}_${this.database}_${this.table} fail!\n${err}`)
        })
        OutputChannel.appendLine("backup end.")

    }


}
