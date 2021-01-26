import { Hanlder, ViewManager } from "@/common/viewManager";
import { HistoryRecorder } from "@/service/common/historyRecorder";
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
import { QueryPage } from "../../service/result/query";
import { DataResponse } from "../../service/result/queryResponse";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { ColumnMeta } from "../other/columnMeta";
import { ColumnNode } from "../other/columnNode";
import { InfoNode } from "../other/infoNode";

export class TableNode extends Node implements CopyAble {

    public iconPath: string = path.join(Constants.RES_PATH, "icon/table.svg");
    public contextValue: string = ModelType.TABLE;

    constructor(public table: string, readonly comment: string, readonly parent: Node) {
        super(`${table}`)
        this.description = comment
        this.init(parent)
        this.cacheSelf()
        this.command = {
            command: "mysql.table.find",
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
        QueryUnit.showSQLTextDocument(this, this.dialect.addColumn(this.wrap(this.table)), Template.alter);
    }


    public async showSource(open = true) {
        let sql: string;
        if (this.dbType == DatabaseType.MYSQL || !this.dbType) {
            const sourceResule = await this.execute<any[]>(this.dialect.showTableSource(this.database, this.table))
            sql = sourceResule[0]['Create Table'];
        } else {
            const childs = await this.getChildren()
            let table = this.table;
            if (this.dbType == DatabaseType.MSSQL) {
                const tables = this.table.split(".")
                tables.shift()
                table = tables.join(".")
            }
            sql = `create table ${table}(\n`
            for (let i = 0; i < childs.length; i++) {
                const child: ColumnNode = childs[i] as ColumnNode;
                if (i == childs.length - 1) {
                    sql += `    ${child.column.name} ${child.type}${child.isPrimaryKey ? ' PRIMARY KEY' : ''}\n`
                } else {
                    sql += `    ${child.column.name} ${child.type}${child.isPrimaryKey ? ' PRIMARY KEY' : ''},\n`
                }
            }
            sql += ");"
        }
        if (open) {
            QueryUnit.showSQLTextDocument(this, sql);
        }
        return sql;
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



    public designTable() {

        const executeAndRefresh = async (sql: string, handler: Hanlder) => {
            try {
                await this.execute(sql)
                await this.refresh()
                await this.parent.refresh()
                handler.emit("success")
            } catch (error) {
                handler.emit("error", error.message)
            }
        }

        ViewManager.createWebviewPanel({
            path: "app", title: "Design Table(Preview)",
            splitView: false, iconPath: Global.getExtPath("resources", "icon", "add.svg"),
            eventHandler: (handler => {
                handler.on("init", () => {
                    handler.emit('route', 'design')
                }).on("route-design", async () => {
                    const result = await this.execute(this.dialect.showIndex(this.database, this.table))
                    let primaryKey: string;
                    const columnList = (await this.getChildren()).map((columnNode: ColumnNode) => {
                        if (columnNode.isPrimaryKey) {
                            primaryKey = columnNode.column.name;
                        }
                        return columnNode.column;
                    });
                    const node = this.getByRegion(this.table) as TableNode || this
                    handler.emit('design-data', { indexs: result, table: node.table, comment: node.comment, columnList, primaryKey, dbType: node.dbType })
                }).on("updateTable", async ({ newTableName, newComment }) => {
                    const sql = this.dialect.updateTable({ table: this.table, newTableName, comment: this.comment, newComment });
                    await executeAndRefresh(sql, handler)
                    this.table=newTableName
                }).on("updateColumn",async (updateColumnParam)=>{
                    const sql = this.dialect.updateColumnSql(updateColumnParam);
                    await executeAndRefresh(sql, handler)
                }).on("dropIndex", async indexName => {
                    const sql = this.dialect.dropIndex(this.table, indexName);
                    await executeAndRefresh(sql, handler)
                }).on("execute", async sql => {
                    await executeAndRefresh(sql, handler)
                }).on("createIndex", async ({ column, type, indexType }) => {
                    const sql = this.dialect.createIndex({ column, type, indexType, table: this.wrap(this.table) });
                    await executeAndRefresh(sql, handler)
                })
            })
        })

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

    public async openTable() {
        const pageSize = Global.getConfig<number>(ConfigKey.DEFAULT_LIMIT);
        const sql = this.dialect.buildPageSql(this.wrap(this.database), this.wrap(this.table), pageSize);
        QueryUnit.runQuery(sql, this);
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
