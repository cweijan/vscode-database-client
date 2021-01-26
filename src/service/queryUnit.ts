"use strict";
import * as vscode from "vscode";
import { CommandKey, ConfigKey, Cursor, DatabaseType, MessageType } from "../common/constants";
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
import { FieldInfo } from "mysql2";
import { rejects } from "assert";

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
                    resolve(({  rows, fields, total }));
                }
            });
        });
    }


    private static importPattern = /^\s*\bsource\b\s+(.+)/i;
    protected static delimiterHodler = new DelimiterHolder()
    public static async runQuery(sql?: string, connectionNode: Node = ConnectionManager.getLastConnectionOption()): Promise<null> {


        Trans.begin()
        connectionNode = NodeUtil.of(connectionNode)

        let fromEditor = false;
        if (!sql) {
            sql = this.getSqlFromEditor(connectionNode);
            fromEditor = true;
        }
        sql = sql.replace(/^\s*--.+/igm, '').trim();

        if (connectionNode.dbType != DatabaseType.ES) {
            // Trim empty sql.
            const sqlList: string[] = sql?.match(/(?:[^;"']+|["'][^"']*["'])+/g)?.filter((s) => (s.trim() != '' && s.trim() != ';'))
            if (sqlList?.length == 1) {
                sql = sqlList[0]
            }

            const parseResult = this.delimiterHodler.parseBatch(sql, connectionNode.getConnectId())
            sql = parseResult.sql
            if (!sql && parseResult.replace) {
                QueryPage.send({ connection: connectionNode, type: MessageType.MESSAGE, res: { message: `change delimiter success`, success: true } as MessageResponse });
                return;
            }

            const importMatch = sql.match(this.importPattern);
            if (importMatch) {
                ServiceManager.getImportService(connectionNode.dbType).importSql(importMatch[1], connectionNode)
                return;
            }

            QueryPage.send({ connection: connectionNode, type: MessageType.RUN, res: { sql } as RunResponse });
        }

        const executeTime = new Date().getTime();
        try {
            (await ConnectionManager.getConnection(connectionNode)).query(sql, (err: Error, data, fields, total) => {
                if (err) {
                    QueryPage.send({ connection: connectionNode, type: MessageType.ERROR, res: { sql, message: err.message } as ErrorResponse });
                    return;
                }
                const costTime = new Date().getTime() - executeTime;
                if (fromEditor) {
                    vscode.commands.executeCommand(CommandKey.RecordHistory, sql, costTime);
                }
                if (data.affectedRows) {
                    QueryPage.send({ connection: connectionNode, type: MessageType.DML, res: { sql, costTime, affectedRows: data.affectedRows } as DMLResponse });
                    // vscode.commands.executeCommand(CommandKey.Refresh);
                    return;
                }

                // query result or multi statement.
                if (Array.isArray(data)) {
                    // not query result
                    if (data[1] && (
                        data[1].__proto__.constructor.name == "array" || data[1].__proto__.constructor.name == "OkPacket" || data[1].__proto__.constructor.name == "ResultSetHeader")
                    ) {
                        QueryPage.send({ connection: connectionNode, type: MessageType.MESSAGE, res: { message: `Execute sql success : ${sql}`, costTime, success: true } as MessageResponse });
                        return;
                    }
                    QueryPage.send({ connection: connectionNode, type: MessageType.DATA, res: { sql, costTime, data, fields, total, pageSize: Global.getConfig(ConfigKey.DEFAULT_LIMIT) } as DataResponse });
                } else {
                    // unknow result, send sql success
                    QueryPage.send({ connection: connectionNode, type: MessageType.MESSAGE, res: { message: `Execute sql success : ${sql}`, costTime, success: true } as MessageResponse });
                }

            });
        } catch (error) {
            console.log(error)
        }
    }
    public static runBatch(connection: IConnection, sqlList: string[]) {
        return new Promise((resolve,reject) => {
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

    private static getSqlFromEditor(connectionNode: Node): string {
        if (!vscode.window.activeTextEditor) {
            throw new Error("No SQL file selected!");

        }
        const activeTextEditor = vscode.window.activeTextEditor;
        const selection = activeTextEditor.selection;
        const newLocal = !selection.isEmpty ? activeTextEditor.document.getText(selection) :
            this.obtainSql(activeTextEditor, this.delimiterHodler.get(connectionNode.getConnectId()));
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
            await vscode.workspace.openTextDocument(await FileManager.record(`${node.uid}#${template}`, sql, FileModel.WRITE))
        );

        return this.sqlDocument;
    }

}



export class QueryResult<T>{
    public rows: T;
    public fields: FieldInfo[];
    public total?: number;
}