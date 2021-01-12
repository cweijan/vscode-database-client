import * as path from "path";
import * as vscode from "vscode";
import { ConfigKey, Constants, DatabaseType, MessageType, ModelType, Template } from "../../common/constants";
import { Global } from "../../common/global";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { MockRunner } from "../../service/mock/mockRunner";
import { QueryUnit } from "../../service/queryUnit";
import { QueryPage } from "../../view/result/query";
import { DataResponse } from "../../view/result/queryResponse";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { ColumnMeta } from "../other/columnMeta";
import { ColumnNode } from "../other/columnNode";
import { InfoNode } from "../other/infoNode";

export class TableNode extends Node implements CopyAble {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/table.svg");
    public contextValue: string = ModelType.TABLE;

    constructor(public readonly table: string, readonly comment: string, readonly parent: Node) {
        super(`${table}`)
        this.description = comment
        this.uid = `${parent.getConnectId()}_${parent.database}_${table}`
        this.init(parent)
        this.command = {
            command: "mysql.template.sql",
            title: "Run Select Statement",
            arguments: [this, true],
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        let columnNodes = DatabaseCache.getColumnListOfTable(this.uid);
        if (columnNodes && !isRresh) {
            return columnNodes;
        }
        return this.execute<ColumnMeta[]>(this.dialect.showColumns(this.database, this.table))
            .then((columns) => {
                columnNodes = columns.map<ColumnNode>((column, index) => {
                    return new ColumnNode(this.table, column, this, index);
                });
                DatabaseCache.setColumnListOfTable(this.uid, columnNodes);
                return columnNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public addColumnTemplate() {
        QueryUnit.showSQLTextDocument(this, `ALTER TABLE
    ${this.wrap(this.table)} 
ADD 
    COLUMN [column] [type] NOT NULL comment '';`, Template.alter);
    }


    public async showSource() {
        if (this.dbType == DatabaseType.MYSQL || !this.dbType) {
            this.execute<any[]>(this.dialect.showTableSource(this.database, this.table))
                .then((sourceResule) => {
                    QueryUnit.showSQLTextDocument(this, sourceResule[0]['Create Table']);
                });
        } else {
            const childs = await this.getChildren()
            let table = this.table;
            if (this.dbType == DatabaseType.MSSQL) {
                const tables = this.table.split(".")
                tables.shift()
                table = tables.join(".")
            }
            let sql = `create table ${table}(\n`
            for (let i = 0; i < childs.length; i++) {
                const child: ColumnNode = childs[i] as ColumnNode;
                if (i == childs.length - 1) {
                    sql += `    ${child.column.name} ${child.type}${child.isPrimaryKey ? ' PRIMARY KEY' : ''}\n`
                } else {
                    sql += `    ${child.column.name} ${child.type}${child.isPrimaryKey ? ' PRIMARY KEY' : ''},\n`
                }
            }
            sql += ");"
            QueryUnit.showSQLTextDocument(this, sql);
        }
    }

    public changeTableName() {

        vscode.window.showInputBox({ value: this.table, placeHolder: 'newTableName', prompt: `You will changed ${this.database}.${this.table} to new table name!` }).then(async (newTableName) => {
            if (!newTableName) { return; }
            const sql = this.dialect.renameTable(this.database, this.table, newTableName);
            this.execute(sql).then((rows) => {
                DatabaseCache.clearTableCache(this.parent.uid);
                DbTreeDataProvider.refresh(this.parent);
            });

        });

    }

    public dropTable() {

        Util.confirm(`Are you want to drop table ${this.table} ? `, async () => {
            this.execute(`DROP TABLE ${this.wrap(this.table)}`).then(() => {
                DatabaseCache.clearTableCache(this.parent.uid);
                DbTreeDataProvider.refresh(this.parent);
                vscode.window.showInformationMessage(`Drop table ${this.table} success!`);
            });
        })

    }


    public truncateTable() {

        Util.confirm(`Are you want to clear table ${this.table} all data ?`, async () => {
            this.execute(`truncate table ${this.wrap(this.table)}`).then(() => {
                vscode.window.showInformationMessage(`Clear table ${this.table} all data success!`);
            });
        })

    }

    public indexTemplate() {
        QueryUnit.showSQLTextDocument(this, `-- ALTER TABLE ${this.wrap(this.table)} DROP INDEX [indexName];
-- ALTER TABLE ${this.wrap(this.table)} ADD [UNIQUE|INDEX|PRIMARY KEY] ([columns]);`, Template.alter);
        setTimeout(() => {
            QueryUnit.runQuery(`SELECT COLUMN_NAME name,table_schema,index_name,non_unique FROM INFORMATION_SCHEMA.STATISTICS WHERE table_schema='${this.database}' and table_name='${this.table}';`, this);
        }, 10);

    }

    public async openInNew() {
        const pageSize = Global.getConfig<number>(ConfigKey.DEFAULT_LIMIT);
        const sql = this.dialect.buildPageSql(this.wrap(this.database), this.wrap(this.table), pageSize);

        const connection = await ConnectionManager.getConnection(this);
        const executeTime = new Date().getTime();
        connection.query(sql, (err: Error, data, fields) => {
            const costTime = new Date().getTime() - executeTime;
            QueryPage.send({ singlePage: false, type: MessageType.DATA, connection: this, res: { sql, costTime, data, fields, pageSize: pageSize } as DataResponse });
        })

    }

    public async countSql() {
        QueryUnit.runQuery(this.dialect.countSql(this.wrap(this.database), this.wrap(this.table)), this);
    }

    public async selectSqlTemplate(run: boolean) {
        const pageSize = Global.getConfig<number>(ConfigKey.DEFAULT_LIMIT);
        const sql = this.dialect.buildPageSql(this.wrap(this.database), this.wrap(this.table), pageSize);

        if (run) {
            QueryUnit.runQuery(sql, this);
        } else {
            QueryUnit.showSQLTextDocument(this, sql, Template.table);
        }

    }

    public insertSqlTemplate(show: boolean = true): Promise<string> {
        return new Promise((resolve) => {
            this
                .getChildren()
                .then((children: Node[]) => {
                    const childrenNames = children.map((child: any) => "\n    " + this.wrap(child.column.name));
                    const childrenValues = children.map((child: any) => "\n    $" + child.column.name);
                    let sql = `insert into \n  ${this.wrap(this.table)} `;
                    sql += `(${childrenNames.toString().replace(/,/g, ", ")}\n  )\n`;
                    sql += "values\n  ";
                    sql += `(${childrenValues.toString().replace(/,/g, ", ")}\n  );`;
                    if (show) {
                        QueryUnit.showSQLTextDocument(this, sql, Template.table);
                    }
                    resolve(sql)
                });
        })
    }

    public deleteSqlTemplate(): any {
        this
            .getChildren()
            .then((children: Node[]) => {
                const keysNames = children.filter((child: any) => child.column.key).map((child: any) => child.column.name);

                const where = keysNames.map((name: string) => `${this.wrap(name)} = \$${name}`);

                let sql = `delete from \n  ${this.wrap(this.table)} \n`;
                sql += `where \n  ${where.toString().replace(/,/g, "\n  and")}`;
                QueryUnit.showSQLTextDocument(this, sql, Template.table);
            });
    }

    public updateSqlTemplate() {
        this
            .getChildren()
            .then((children: Node[]) => {
                const keysNames = children.filter((child: any) => child.column.key).map((child: any) => child.column.name);
                const childrenNames = children.filter((child: any) => !child.column.key).map((child: any) => child.column.name);

                const sets = childrenNames.map((name: string) => `${name} = ${name}`);
                const where = keysNames.map((name: string) => `${name} = '${name}'`);

                let sql = `update \n  ${this.wrap(this.table)} \nset \n  ${sets.toString().replace(/,/g, ",\n  ")}\n`;
                sql += `where \n  ${where.toString().replace(/,/g, "\n  and ")}`;
                QueryUnit.showSQLTextDocument(this, sql, Template.table);
            });
    }

    public async getMaxPrimary(): Promise<number> {

        const primaryKey = MockRunner.primaryKeyMap[this.uid];
        if (primaryKey != null) {
            const count = await this.execute(`select max(${primaryKey}) max from ${this.table}`);
            if (count && count[0]) { return count[0].max }
        }


        return Promise.resolve(0)
    }

    public copyName(): void {
        Util.copyToBoard(this.table);
    }


}
