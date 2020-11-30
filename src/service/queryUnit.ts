"use strict";
import * as fs from "fs";
import * as mysql from "mysql2";
import { Connection } from "mysql2";
import * as vscode from "vscode";
import { CommandKey, ConfigKey, Cursor, MessageType, Pattern, Constants } from "../common/constants";
import { Global } from "../common/global";
import { Console } from "../common/Console";
import { FileManager, FileModel } from "../common/filesManager";
import { Node } from "../model/interface/node";
import { QueryPage } from "../view/result/query";
import { DataResponse, DMLResponse, ErrorResponse, MessageResponse, RunResponse } from "../view/result/queryResponse";
import { ConnectionManager } from "./connectionManager";
import { DelimiterHolder } from "./common/delimiterHolder";
import { ServiceManager } from "./serviceManager";
import { NodeUtil } from "~/model/nodeUtil";
import { Trans } from "~/common/trans";

export class QueryUnit {

    public static readonly maxTableCount = Global.getConfig<number>(ConfigKey.MAX_TABLE_COUNT);

    public static queryPromise<T>(connection: mysql.Connection, sql: string,showError=true): Promise<T> {
        return new Promise((resolve, reject) => {
            connection.query(sql, (err: mysql.MysqlError, rows) => {
                if (err) {
                    if(showError){
                        Console.log(`Execute sql fail : ${sql}`);
                        Console.log(err);
                    }
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }


    private static selectPattern = /^\s*\bselect\b.+/ig;
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

        const parseResult = this.delimiterHodler.parseBatch(sql, connectionNode.getConnectId())
        sql = parseResult.sql
        if (!sql && parseResult.replace) {
            QueryPage.send({ type: MessageType.MESSAGE, res: { message: `change delimiter success`, success: true } as MessageResponse });
            return;
        }

        const importMatch = sql.match(this.importPattern);
        if (importMatch) {
            ServiceManager.instance.importService.import(importMatch[1], ConnectionManager.getLastConnectionOption())
            return;
        }

        const sqlList: string[] = sql.match(/(?:[^;"']+|["'][^"']*["'])+/g).filter((s) => (s.trim() != '' && s.trim() != ';'))
        if (sqlList.length == 0 && sql.match(this.selectPattern) && !sql.match(/\blimit\b/i) && !sql.match(/;\s*$/) && !sql.match(/[count|sum|min|max]\(/i)) {
            sql += ` LIMIT ${Global.getConfig(ConfigKey.DEFAULT_LIMIT)}`;
        }

        QueryPage.send({ type: MessageType.RUN, res: { sql } as RunResponse });

        const executeTime = new Date().getTime();
        (await ConnectionManager.getConnection(connectionNode, true)).query(sql, (err: mysql.MysqlError, data, fields?: mysql.FieldInfo[]) => {
            if (err) {
                QueryPage.send({ type: MessageType.ERROR, res: { sql, message: err.message } as ErrorResponse });
                return;
            }
            const costTime = new Date().getTime() - executeTime;
            if (fromEditor) {
                vscode.commands.executeCommand(CommandKey.RecordHistory, sql, costTime);
            }
            if (data.affectedRows) {
                QueryPage.send({ type: MessageType.DML, res: { sql, costTime, affectedRows: data.affectedRows } as DMLResponse });
                vscode.commands.executeCommand(CommandKey.Refresh);
                return;
            }

            // query result or multi statement.
            if (Array.isArray(data)) {
                // not query result
                if (data[1] && (
                    data[1].__proto__.constructor.name == "array" || data[1].__proto__.constructor.name == "OkPacket" || data[1].__proto__.constructor.name == "ResultSetHeader")
                ) {
                    QueryPage.send({ type: MessageType.MESSAGE, res: { message: `Execute sql success : ${sql}`, costTime, success: true } as MessageResponse });
                    return;
                }
                QueryPage.send({ type: MessageType.DATA, connection: connectionNode, res: { sql, costTime, data, fields, pageSize: Global.getConfig(ConfigKey.DEFAULT_LIMIT) } as DataResponse });
            } else {
                // unknow result, send sql success
                QueryPage.send({ type: MessageType.MESSAGE, res: { message: `Execute sql success : ${sql}`, costTime, success: true } as MessageResponse });
            }

        });
    }
    public static runBatch(connection: mysql.Connection, sqlList: string[]) {
        return new Promise((resolve) => {
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
                    resolve(false)
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
    public static async showSQLTextDocument(sql: string = "", template = "template.sql") {

        this.sqlDocument = await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(await FileManager.record(template, sql, FileModel.WRITE))
        );

        return this.sqlDocument;
    }

}

