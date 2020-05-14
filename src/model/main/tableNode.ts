import * as path from "path";
import * as mysql from "mysql";
import * as vscode from "vscode";
import { Constants, ModelType, Template, MessageType } from "../../common/constants";
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

export class TableNode extends Node implements CopyAble {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/table.svg");
    public contextValue: string = ModelType.TABLE;

    constructor(public readonly table: string, readonly comment: string, readonly info: Node) {
        super(`${table}`)
        this.description = comment
        this.id = `${info.getConnectId()}_${info.database}_${table}`
        this.init(info)
        this.command = {
            command: "mysql.template.sql",
            title: "Run Select Statement",
            arguments: [this, true],
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        let columnNodes = DatabaseCache.getColumnListOfTable(this.id);
        if (columnNodes && !isRresh) {
            return columnNodes;
        }
        return QueryUnit.queryPromise<ColumnMeta[]>(await ConnectionManager.getConnection(this), `SELECT COLUMN_NAME name,DATA_TYPE simpleType,COLUMN_TYPE type,COLUMN_COMMENT comment,COLUMN_KEY \`key\`,IS_NULLABLE nullable,CHARACTER_MAXIMUM_LENGTH maxLength FROM information_schema.columns WHERE table_schema = '${this.database}' AND table_name = '${this.table}';`)
            .then((columns) => {
                columnNodes = columns.map<ColumnNode>((column) => {
                    if (column && column.key == "PRI") {
                        MockRunner.primaryKeyMap[this.getConnectId()] = column.name
                    }
                    return new ColumnNode(this.table, column, this.info);
                });
                DatabaseCache.setColumnListOfTable(this.id, columnNodes);

                return columnNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public addColumnTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.showSQLTextDocument(`ALTER TABLE
    ${Util.wrap(this.database)}.${Util.wrap(this.table)} 
ADD 
    COLUMN [column] [type] NOT NULL comment '';`, Template.alter);
    }


    public async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this, true), `SHOW CREATE TABLE \`${this.database}\`.\`${this.table}\``)
            .then((procedDtail) => {
                QueryUnit.showSQLTextDocument(procedDtail[0]['Create Table']);
            });
    }

    public changeTableName() {

        vscode.window.showInputBox({ value: this.table, placeHolder: 'newTableName', prompt: `You will changed ${this.database}.${this.table} to new table name!` }).then(async (newTableName) => {
            if (!newTableName) { return; }
            const sql = `RENAME TABLE \`${this.database}\`.\`${this.table}\` to \`${this.database}\`.\`${newTableName}\``;
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), sql).then((rows) => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.database}`);
                DbTreeDataProvider.refresh();
            });

        });

    }

    public dropTable() {

        Util.confirm(`Are you want to drop table ${this.table} ? `, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP TABLE \`${this.database}\`.\`${this.table}\``).then(() => {
                DatabaseCache.clearTableCache(`${this.getConnectId()}_${this.database}`);
                DbTreeDataProvider.refresh();
                vscode.window.showInformationMessage(`Drop table ${this.table} success!`);
            });
        })

    }


    public truncateTable() {

        Util.confirm(`Are you want to clear table ${this.table} all data ?`, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `truncate table \`${this.database}\`.\`${this.table}\``).then(() => {
                vscode.window.showInformationMessage(`Clear table ${this.table} all data success!`);
            });
        })

    }

    public indexTemplate() {
        ConnectionManager.getConnection(this, true);
        QueryUnit.showSQLTextDocument(`-- ALTER TABLE ${Util.wrap(this.database)}.${Util.wrap(this.table)} DROP INDEX [indexName];
-- ALTER TABLE ${Util.wrap(this.database)}.${Util.wrap(this.table)} ADD [UNIQUE|KEY|PRIMARY KEY] INDEX ([column]);`, Template.alter);
        setTimeout(() => {
            QueryUnit.runQuery(`SELECT COLUMN_NAME name,table_schema,index_name,non_unique FROM INFORMATION_SCHEMA.STATISTICS WHERE table_schema='${this.database}' and table_name='${this.table}';`, this);
        }, 10);

    }

    public async openInNew() {
        const sql = `SELECT * FROM ${Util.wrap(this.database)}.${Util.wrap(this.table)} LIMIT ${Constants.DEFAULT_SIZE};`;
        const connection = await ConnectionManager.getConnection(this);
        const executeTime = new Date().getTime();
        connection.query(sql, (err: mysql.MysqlError, data, fields?: mysql.FieldInfo[]) => {
            const costTime = new Date().getTime() - executeTime;
            QueryPage.send({ singlePage: false, type: MessageType.DATA, connection: this, res: { sql, costTime, data, fields, pageSize: Constants.DEFAULT_SIZE } as DataResponse });
        })

    }

    public async selectSqlTemplate(run: boolean) {
        const sql = `SELECT * FROM ${Util.wrap(this.database)}.${Util.wrap(this.table)} LIMIT ${Constants.DEFAULT_SIZE};`;

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
                    const childrenNames = children.map((child: any) => "\n    " + Util.wrap(child.column.name));
                    const childrenValues = children.map((child: any) => "\n    $" + child.column.name);
                    let sql = `insert into \n  ${Util.wrap(this.database)}.${Util.wrap(this.table)} `;
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

                const where = keysNames.map((name: string) => `${Util.wrap(name)} = \$${name}`);

                let sql = `delete from \n  ${Util.wrap(this.database)}.${Util.wrap(this.table)} \n`;
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

                let sql = `update \n  ${Util.wrap(this.database)}.${Util.wrap(this.table)} \nset \n  ${sets.toString().replace(/,/g, ",\n  ")}\n`;
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
