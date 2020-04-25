"use strict";
import * as fs from "fs";
import * as mysql from "mysql";
import { Connection } from "mysql";
import * as vscode from "vscode";
import { CommandKey, ConfigKey, Cursor, MessageType } from "../common/Constants";
import { Global } from "../common/Global";
import { Console } from "../common/OutputChannel";
import { FileManager, FileModel } from "../common/FileManager";
import { Node } from "../model/interface/node";
import { QueryPage } from "../view/result/query";
import { DataResponse, DMLResponse, ErrorResponse, MessageResponse, RunResponse } from "../view/result/queryResponse";
import { ConnectionManager } from "./ConnectionManager";

export class QueryUnit {

    public static readonly maxTableCount = Global.getConfig<number>(ConfigKey.MAX_TABLE_COUNT);

    public static queryPromise<T>(connection: mysql.Connection, sql: string): Promise<T> {
        return new Promise((resolve, reject) => {
            // Console.log(`Execute SQL:${sql}`)
            connection.query(sql, (err: mysql.MysqlError, rows) => {
                if (err) {
                    Console.log(`Execute sql fail : ${sql}`);
                    Console.log(err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    private static ddlPattern = /^(alter|create|drop)/ig;
    private static dmlPattern = /^(insert|update|delete)/ig;
    private static multiPattern = /\b(TRIGGER|PROCEDURE|FUNCTION)\b/ig;
    public static async runQuery(sql?: string, connectionNode?: Node): Promise<null> {
        if (!sql && !vscode.window.activeTextEditor) {
            vscode.window.showWarningMessage("No SQL file selected");
            return;
        }
        let connection: mysql.Connection;
        if (!connectionNode) {
            if (!(connection = await ConnectionManager.getLastActiveConnection())) {
                vscode.window.showWarningMessage("No MySQL Server or Database selected");
                return;
            } else {
                connectionNode = ConnectionManager.getLastConnectionOption();
            }

        } else if (connectionNode) {
            connection = await ConnectionManager.getConnection(connectionNode);
        }

        let fromEditor = false;
        if (!sql) {
            fromEditor = true;
            const activeTextEditor = vscode.window.activeTextEditor;
            const selection = activeTextEditor.selection;
            if (selection.isEmpty) {
                sql = this.obtainSql(activeTextEditor);
            } else {
                sql = activeTextEditor.document.getText(selection);
            }
        }
        sql = sql.replace(/--.+/ig, '').trim();
        const executeTime = new Date().getTime();
        const isDDL = sql.match(this.ddlPattern);
        const isDML = sql.match(this.dmlPattern);
        if (isDDL == null && isDML == null) {
            QueryPage.send({ type: MessageType.RUN, res: { sql } as RunResponse });
        }
        if (!sql.match(this.multiPattern)) {
            const sqlList: string[] = sql.split(";").filter((s) => s.trim() != '')
            if (sqlList.length > 1) {
                const success = await this.runBatch(connection, sqlList)
                QueryPage.send({ type: MessageType.MESSAGE, res: { message: `Batch execute sql ${success ? 'success' : 'fail'}!`, success } as MessageResponse });
                return;
            }
        }
        connection.query(sql, (err: mysql.MysqlError, data, fields?: mysql.FieldInfo[]) => {
            if (err) {
                QueryPage.send({ type: MessageType.ERROR, res: { sql, message: err.message } as ErrorResponse });
                return;
            }
            const costTime = new Date().getTime() - executeTime;
            if (fromEditor) {
                vscode.commands.executeCommand(CommandKey.RecordHistory, sql, costTime);
            }
            if (isDDL) {
                QueryPage.send({ type: MessageType.DML, res: { sql, costTime, affectedRows: data.affectedRows } as DMLResponse });
                vscode.commands.executeCommand(CommandKey.Refresh);
                return;
            }
            if (isDML) {
                QueryPage.send({ type: MessageType.DML, res: { sql, costTime, affectedRows: data.affectedRows } as DMLResponse });
                return;
            }
            if (Array.isArray(data)) {
                QueryPage.send({ type: MessageType.DATA, connection: connectionNode, res: { sql, costTime, data, fields } as DataResponse });
                return;
            }
            QueryPage.send({ type: MessageType.MESSAGE, res: { msg: `Execute sql success : ${sql}`, costTime } });

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
    public static obtainSql(activeTextEditor: vscode.TextEditor): string {

        const content = activeTextEditor.document.getText();
        if (content.match(this.batchPattern)) { return content; }

        return this.obtainCursorSql(activeTextEditor.document, activeTextEditor.selection.active, content);

    }

    public static obtainCursorSql(document: vscode.TextDocument, current: vscode.Position, content?: string) {
        if (!content) { content = document.getText(new vscode.Range(new vscode.Position(0, 0), current)); }
        const sqlList = content.split(";");
        const docCursor = document.getText(Cursor.getRangeStartTo(current)).length;
        let index = 0;
        for (let i = 0; i < sqlList.length; i++) {
            const sql = sqlList[i];
            index += (sql.length + 1);
            if (docCursor < index) {
                const trimSql = sql.trim();
                if (!trimSql && i > 1) { return sqlList[i - 1]; }
                return trimSql;
            }
        }

        return '';
    }

    private static sqlDocument: vscode.TextEditor;
    public static async showSQLTextDocument(sql: string = "") {

        this.sqlDocument = await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(await FileManager.record("template.sql", sql, FileModel.WRITE))
        );

        return this.sqlDocument;
    }

    public static async runFile(connection: Connection, fsPath: string) {
        const stats = fs.statSync(fsPath);
        const startTime = new Date();
        const fileSize = stats.size;
        if (fileSize > 1024 * 1024 * 100) {
            vscode.window.showErrorMessage(`Import sql exceed max limit 100M!`)
            return;
            // if (await this.executeByLine(connection, fsPath)) {
            //     Console.log(`import success, cost time : ${new Date().getTime() - startTime.getTime()}ms`);
            // }
        } else {
            const fileContent = fs.readFileSync(fsPath, 'utf8');
            const sqlList = fileContent.split(";")
            this.runBatch(connection, sqlList)
            Console.log(`import success, cost time : ${new Date().getTime() - startTime.getTime()}ms`);
        }
        vscode.commands.executeCommand(CommandKey.Refresh)

    }

    /**
     * TODO: have problem, fail
     * @param connection 
     * @param fsPath 
     */
    private static async executeByLine(connection: any, fsPath: string) {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: fs.createReadStream(fsPath.replace("\\", "/")),
            terminal: false,
        });
        rl.on('line', (chunk) => {
            const sql = chunk.toString('utf8');
            connection.query(sql, (err, sets, fields) => {
                if (err) { Console.log(`execute sql ${sql} fail,${err}`); }
            });
        });
        return true;
    }

}

