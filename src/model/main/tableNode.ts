import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType, Template, MessageType, ConfigKey } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { QueryUnit } from "../../service/queryUnit";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { ColumnNode } from "../other/columnNode";
import { InfoNode } from "../other/infoNode";
import { MockRunner } from "../../service/mock/mockRunner";
import { QueryPage } from "../../view/result/query";
import { DataResponse } from "../../view/result/queryResponse";
import { ColumnMeta } from "../other/columnMeta";
import { Global } from "../../common/global";

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
        if (columnNodes && !isRresh && this.collapsibleState != vscode.TreeItemCollapsibleState.Expanded) {
            return columnNodes;
        }
        return QueryUnit.queryPromise<ColumnMeta[]>(await ConnectionManager.getConnection(this), this.dialect.showColumns(this.database,this.table))
            .then((columns) => {
                columnNodes = columns.map<ColumnNode>((column, index) => {
                    if (column && column.key == "PRI") {
                        MockRunner.primaryKeyMap[this.getConnectId()] = column.name
                    }
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
        ConnectionManager.getConnection(this, true);
        QueryUnit.showSQLTextDocument(`ALTER TABLE
    ${this.wrap(this.database)}.${this.wrap(this.table)} 
ADD 
    COLUMN [column] [type] NOT NULL comment '';`, Template.alter);
    }


    public async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this, true), this.dialect.showTableSource(this.database,this.table))
            .then((sourceResule) => {
                QueryUnit.showSQLTextDocument(sourceResule[0]['Create Table']);
            });
    }

    public changeTableName() {

        vscode.window.showInputBox({ value: this.table, placeHolder: 'newTableName', prompt: `You will changed ${this.database}.${this.table} to new table name!` }).then(async (newTableName) => {
            if (!newTableName) { return; }
            const sql = this.dialect.renameTable(this.database,this.table,newTableName);
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), sql).then((rows) => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.database}`);
                DbTreeDataProvider.refresh(this.parent);
            });

        });

    }

    public dropTable() {

        Util.confirm(`Are you want to drop table ${this.table} ? `, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP TABLE ${this.wrap(this.database)}.${this.wrap(this.table)}`).then(() => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.database}`);
                DbTreeDataProvider.refresh(this.parent);
                vscode.window.showInformationMessage(`Drop table ${this.table} success!`);
            });
        })

    }


    public truncateTable() {

        Util.confirm(`Are you want to clear table ${this.table} all data ?`, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `truncate table ${this.wrap(this.database)}.${this.wrap(this.table)}`).then(() => {
                vscode.window.showInformationMessage(`Clear table ${this.table} all data success!`);
            });
        })

    }

    public indexTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.showSQLTextDocument(`-- ALTER TABLE ${this.wrap(this.database)}.${this.wrap(this.table)} DROP INDEX [indexName];
-- ALTER TABLE ${this.wrap(this.database)}.${this.wrap(this.table)} ADD [UNIQUE|INDEX|PRIMARY KEY] ([columns]);`, Template.alter);
        setTimeout(() => {
            QueryUnit.runQuery(`SELECT COLUMN_NAME name,table_schema,index_name,non_unique FROM INFORMATION_SCHEMA.STATISTICS WHERE table_schema='${this.database}' and table_name='${this.table}';`, this);
        }, 10);

    }

    public async openInNew() {
        const pageSize = Global.getConfig<number>(ConfigKey.DEFAULT_LIMIT);
        const sql = this.dialect.buildPageSql(this.wrap(this.database),this.wrap(this.table),pageSize);

        const connection = await ConnectionManager.getConnection(this);
        const executeTime = new Date().getTime();
        connection.query(sql, (err: Error, data, fields) => {
            const costTime = new Date().getTime() - executeTime;
            QueryPage.send({ singlePage: false, type: MessageType.DATA, connection: this, res: { sql, costTime, data, fields, pageSize: pageSize } as DataResponse },this);
        })

    }

    public async countSql() {
        QueryUnit.runQuery(this.dialect.countSql(this.wrap(this.database),this.wrap(this.table)), this);
    }

    public async selectSqlTemplate(run: boolean) {
        const pageSize = Global.getConfig<number>(ConfigKey.DEFAULT_LIMIT);
        const sql = this.dialect.buildPageSql(this.wrap(this.database),this.wrap(this.table),pageSize);

        if (run) {
            QueryUnit.runQuery(sql, this);
        } else {
            QueryUnit.showSQLTextDocument(sql, Template.table);
        }

    }

    public insertSqlTemplate(show: boolean = true): Promise<string> {
        return new Promise((resolve) => {
            this
                .getChildren()
                .then((children: Node[]) => {
                    const childrenNames = children.map((child: any) => "\n    " + this.wrap(child.column.name));
                    const childrenValues = children.map((child: any) => "\n    $" + child.column.name);
                    let sql = `insert into \n  ${this.wrap(this.database)}.${this.wrap(this.table)} `;
                    sql += `(${childrenNames.toString().replace(/,/g, ", ")}\n  )\n`;
                    sql += "values\n  ";
                    sql += `(${childrenValues.toString().replace(/,/g, ", ")}\n  );`;
                    if (show) {
                        QueryUnit.showSQLTextDocument(sql, Template.table);
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

                let sql = `delete from \n  ${this.wrap(this.database)}.${this.wrap(this.table)} \n`;
                sql += `where \n  ${where.toString().replace(/,/g, "\n  and")}`;
                QueryUnit.showSQLTextDocument(sql, Template.table);
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

                let sql = `update \n  ${this.wrap(this.database)}.${this.wrap(this.table)} \nset \n  ${sets.toString().replace(/,/g, ",\n  ")}\n`;
                sql += `where \n  ${where.toString().replace(/,/g, "\n  and ")}`;
                QueryUnit.showSQLTextDocument(sql, Template.table);
            });
    }

    public async getMaxPrimary(): Promise<number> {

        const connection = await ConnectionManager.getConnection(this, false)

        const primaryKey = MockRunner.primaryKeyMap[this.getConnectId()];
        if (primaryKey != null) {
            const count = await QueryUnit.queryPromise(connection, `select max(${primaryKey}) max from ${this.table}`);
            if (count && count[0]) { return count[0].max }
        }


        return Promise.resolve(0)
    }

    public copyName(): void {
        Util.copyToBoard(this.table);
    }


}
