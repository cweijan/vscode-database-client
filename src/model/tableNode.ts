import * as mysql from "mysql";
import * as path from "path";
import * as vscode from "vscode";
import { AppInsightsClient } from "../common/appInsightsClient";
import { Global } from "../common/global";
import { OutputChannel } from "../common/outputChannel";
import { Utility } from "../common/utility";
import { ColumnNode } from "./columnNode";
import { InfoNode } from "./infoNode";
import { INode } from "./INode";
import { DatabaseCache } from "../common/DatabaseCache";
import { ModelType } from "../common/constants";

export class TableNode implements INode {
    identify: string;
    type: string = ModelType.TABLE;

    constructor(private readonly host: string, private readonly user: string, private readonly password: string,
        private readonly port: string, private readonly database: string, readonly table: string,
        private readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {
        this.identify=`${this.host}_${this.port}_${this.user}_${this.database}_${this.table}`
        let item = new vscode.TreeItem(this.table);
        item.collapsibleState =DatabaseCache.getElementState(this)
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
        const connection = Utility.createConnection({
            host: this.host,
            user: this.user,
            password: this.password,
            port: this.port,
            database: this.database,
            certPath: this.certPath,
        });

        return Utility.queryPromise<any[]>(connection, `SELECT * FROM information_schema.columns WHERE table_schema = '${this.database}' AND table_name = '${this.table}';`)
            .then((columns) => {

                let columnNodes = DatabaseCache.getColumnListOfTable(this.table)
                if (columnNodes && columnNodes.length > 0 && !isRresh) {
                    return columnNodes;
                }
                columnNodes = columns.map<ColumnNode>((column) => {
                    return new ColumnNode(this.host, this.user, this.password, this.port, this.database, column);
                })
                DatabaseCache.setColumnListOfTable(this.table, columnNodes)

                return columnNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
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
    public printNames() {
        this
            .getChildren()
            .then((children: INode[]) => {
                const childrenNames = children.map((child: any) => child.column.COLUMN_NAME);

                let names = `${this.database}.${this.table}`
                names += `  ${childrenNames.toString().replace(/,/g, "\n  ")}`
                const render = async () => {
                    let textDocument = await vscode.workspace.openTextDocument({ content: names, language: "plaintext" })
                    vscode.window.showTextDocument(textDocument);
                }
                render()
            });
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

}
