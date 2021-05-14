"use strict";
import * as vscode from "vscode";
import { CodeCommand, ConfigKey, Cursor, DatabaseType, MessageType } from "../common/constants";
import { Global } from "../common/global";
import { Console } from "../common/Console";
import { FileManager, FileModel } from "../common/filesManager";
import { Node } from "../model/interface/node";
import { QueryPage } from "./result/query";
import { DataResponse, DMLResponse, ErrorResponse, MessageResponse, RunResponse } from "./result/queryResponse";
import { ConnectionManager } from "./connectionManager";
import { DelimiterHolder } from "./common/delimiterHolder";
import { ServiceManager } from "./serviceManager";
import { NodeUtil } from "~/model/nodeUtil";
import { Trans } from "~/common/trans";
import { IConnection } from "./connect/connection";
import { FieldInfo } from "@/common/typeDef";
import { Util } from "@/common/util";

export class QueryUnit {

    public static queryPromise<T>(connection: IConnection, sql: string, showError = true): Promise<QueryResult<T>> {
        return new Promise((resolve, reject) => {
            connection.query(sql, (err: Error, rows, fields, total) => {
                if (err) {
                    if (showError) {
                        Console.log(`Execute sql fail : ${sql}`);
                        Console.log(err);
                    }
                    reject(err);
                } else {
                    resolve(({ rows, fields, total }));
                }
            });
        });
    }


    private static importPattern = /^\s*\bsource\b\s+(.+)/i;
    public static async runQuery(sql: string, connectionNode: Node, queryOption: QueryOption = {}): Promise<null> {

        if (!connectionNode) {
            vscode.window.showErrorMessage("Not active database connection found!")
            throw new Error("Not active database connection found!")
        }

        Trans.begin()
        connectionNode = NodeUtil.of(connectionNode)
        if (queryOption.split == null) queryOption.split = sql == null;

        let recordHistory = queryOption.recordHistory;
        if (!sql) {
            sql = this.getSqlFromEditor(connectionNode, queryOption.runAll);
            recordHistory = true;
        }
        sql = sql.replace(/^\s*--.+/igm, '').trim();

        if (connectionNode.dbType != DatabaseType.ES) {
            // Trim empty sql.
            const sqlList: string[] = sql?.match(/(?:[^;"']+|["'][^"']*["'])+/g)?.filter((s) => (s.trim() != '' && s.trim() != ';'))
            if (sqlList?.length == 1) {
                sql = sqlList[0]
            }

            const parseResult = DelimiterHolder.parseBatch(sql, connectionNode.getConnectId())
            sql = parseResult.sql
            if (!sql && parseResult.replace) {
                QueryPage.send({ connection: connectionNode, type: MessageType.MESSAGE, queryOption, res: { message: `change delimiter success`, success: true } as MessageResponse });
                return;
            }

            const importMatch = sql.match(this.importPattern);
            if (importMatch) {
                ServiceManager.getImportService(connectionNode.dbType).importSql(importMatch[1], connectionNode)
                return;
            }

            QueryPage.send({ connection: connectionNode, type: MessageType.RUN, queryOption, res: { sql } as RunResponse });
        }

        const executeTime = new Date().getTime();
        try {
            (await ConnectionManager.getConnection(connectionNode)).query(sql, (err: Error, data, fields, total) => {
                if (err) {
                    QueryPage.send({ connection: connectionNode, type: MessageType.ERROR, queryOption, res: { sql, message: err.message } as ErrorResponse });
                    return;
                }
                const costTime = new Date().getTime() - executeTime;
                if (recordHistory) {
                    vscode.commands.executeCommand(CodeCommand.RecordHistory, sql, costTime);
                }

                if (sql.match(/create (table|prcedure|FUNCTION|VIEW)/i)) {
                    vscode.commands.executeCommand(CodeCommand.Refresh);
                }

                if (data.affectedRows) {
                    QueryPage.send({ connection: connectionNode, type: MessageType.DML, queryOption, res: { sql, costTime, affectedRows: data.affectedRows } as DMLResponse });
                    return;
                }

                // query result
                if (Array.isArray(fields)) {
                    const isQuery = fields[0] != null && fields[0].name != undefined;
                    const isSqliteEmptyQuery = fields.length == 0 && sql.match(/\bselect\b/i);
                    if (isQuery || isSqliteEmptyQuery) {
                        QueryPage.send({ connection: connectionNode, type: MessageType.DATA, queryOption, res: { sql, costTime, data, fields, total, pageSize: Global.getConfig(ConfigKey.DEFAULT_LIMIT) } as DataResponse });
                        return;
                    }
                }

                if (Array.isArray(data)) {
                    // mysql procedrue call result
                    const lastEle = data[data.length - 1]
                    if (data.length > 2 && Util.is(lastEle, 'ResultSetHeader') && Util.is(data[0], 'TextRow')) {
                        data = data[data.length - 2]
                        fields = fields[fields.length - 2] as any as FieldInfo[]
                        QueryPage.send({ connection: connectionNode, type: MessageType.DATA, queryOption, res: { sql, costTime, data, fields, total, pageSize: Global.getConfig(ConfigKey.DEFAULT_LIMIT) } as DataResponse });
                        return;
                    }
                }

                QueryPage.send({ connection: connectionNode, type: MessageType.MESSAGE_BLOCK, queryOption, res: { sql, costTime, isInsert: sql.match(/\binsert\b/i) != null } as DMLResponse });

            });
        } catch (error) {
            console.log(error)
        }
    }
    public static runBatch(connection: IConnection, sqlList: string[]) {
        return new Promise((resolve, reject) => {
            connection.beginTransaction(async () => {
                try {
                    for (let sql of sqlList) {
                        sql = sql.trim()
                        if (!sql) { continue }
                        await this.queryPromise(connection, sql)
                    }
                    connection.commit()
                    resolve(true)
                } catch (err) {
                    connection.rollback()
                    reject(err)
                }
            })
        })

    }


    private static batchPattern = /\s+(TRIGGER|PROCEDURE|FUNCTION)\s+/ig;

    private static getSqlFromEditor(connectionNode: Node, runAll: boolean): string {
        if (!vscode.window.activeTextEditor) {
            throw new Error("No SQL file selected!");

        }
        const activeTextEditor = vscode.window.activeTextEditor;
        if (runAll) {
            return activeTextEditor.document.getText()
        }

        const selection = activeTextEditor.selection;
        const newLocal = !selection.isEmpty ? activeTextEditor.document.getText(selection) :
            this.obtainSql(activeTextEditor, DelimiterHolder.get(connectionNode.getConnectId()));
        return newLocal;
    }

    public static obtainSql(activeTextEditor: vscode.TextEditor, delimiter?: string): string {

        const content = activeTextEditor.document.getText();
        if (content.match(this.batchPattern)) { return content; }

        return this.obtainCursorSql(activeTextEditor.document, activeTextEditor.selection.active, content, delimiter);

    }

    public static obtainCursorSql(document: vscode.TextDocument, current: vscode.Position, content?: string, delimiter?: string) {
        if (!content) { content = document.getText(new vscode.Range(new vscode.Position(0, 0), current)); }
        if (delimiter) {
            content = content.replace(new RegExp(delimiter, 'g'), ";")
        }
        const sqlList = content.match(/(?:[^;"']+|["'][^"']*["'])+/g);
        if (!sqlList) return "";
        if (sqlList.length == 1) return sqlList[0];

        const trimSqlList = []
        const docCursor = document.getText(Cursor.getRangeStartTo(current)).length;
        let index = 0;
        for (let i = 0; i < sqlList.length; i++) {
            const sql = sqlList[i];
            const trimSql = sql.trim();
            if (trimSql) {
                trimSqlList.push(trimSql)
            }
            index += (sql.length + 1);
            if (docCursor < index) {
                if (!trimSql && sqlList.length > 1) { return sqlList[i - 1]; }
                return trimSql;
            }
        }

        return trimSqlList[trimSqlList.length - 1];
    }

    private static sqlDocument: vscode.TextEditor;
    public static async showSQLTextDocument(node: Node, sql: string, template = "template.sql") {

        this.sqlDocument = await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(await FileManager.record(`${node.uid}/${template}`, sql, FileModel.WRITE))
        );

        return this.sqlDocument;
    }

}



export interface QueryResult<T> {
    rows: T; fields: FieldInfo[];
    total?: number;
}


export interface QueryOption {
    viewId?: any;
    split?: boolean;
    recordHistory?: boolean;
    /**
     * runAll if get sql from editor.
     */
    runAll?: boolean;
}