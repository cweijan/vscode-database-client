"use strict";
import * as fs from "fs";
import * as mysql from "mysql";
import { Connection } from "mysql";
import * as vscode from "vscode";
import { CommandKey, ConfigKey, Cursor, MessageType, Pattern } from "../common/constants";
import { Global } from "../common/global";
import { Console } from "../common/outputChannel";
import { FileManager, FileModel } from "../common/filesManager";
import { Node } from "../model/interface/node";
import { QueryPage } from "../view/result/query";
import { DataResponse, DMLResponse, ErrorResponse, MessageResponse, RunResponse } from "../view/result/queryResponse";
import { ConnectionManager } from "./connectionManager";
import { DelimiterHolder } from "./common/delimiterHolder";

export class QueryUnit {

    public static readonly maxTableCount = Global.getConfig<number>(ConfigKey.MAX_TABLE_COUNT);

    public static queryPromise<T>(connection: mysql.Connection, sql: string): Promise<T> {
        return new Promise((resolve, reject) => {
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
    protected static delimiterHodler = new DelimiterHolder()
    public static async runQuery(sql?: string, connectionNode?: Node): Promise<null> {
        if (!sql && !vscode.window.activeTextEditor) {
            vscode.window.showWarningMessage("No SQL file selected");
            return;
        }
        if (!connectionNode) {
            connectionNode = ConnectionManager.getLastConnectionOption();
        }
        const connection = await ConnectionManager.getConnection(connectionNode);
        if (!connection) {
            vscode.window.showWarningMessage("No MySQL Server or Database selected");
            return;
        }

        let fromEditor = false;
        if (!sql) {
            fromEditor = true;
            const activeTextEditor = vscode.window.activeTextEditor;
            const selection = activeTextEditor.selection;
            if (selection.isEmpty) {
                sql = this.obtainSql(activeTextEditor, this.delimiterHodler.get(connectionNode.getConnectId()));
            } else {
                sql = activeTextEditor.document.getText(selection);
            }
        }
        sql = sql.replace(/--.+/ig, '').trim();
        const executeTime = new Date().getTime();
        const isDDL = sql.match(this.ddlPattern);
        const isDML = sql.match(this.dmlPattern);
        const parseResult = this.delimiterHodler.parseBatch(sql, connectionNode.getConnectId())
        sql = parseResult.sql
        if (!sql && parseResult.replace) {
            QueryPage.send({ type: MessageType.MESSAGE, res: { message: `change delimiter success`, success: true } as MessageResponse });
            return;
        }
        if (isDDL == null && isDML == null && sql) {
            QueryPage.send({ type: MessageType.RUN, res: { sql } as RunResponse });
        }

        const isMulti = sql.match(Pattern.MULTI_PATTERN);
        if (!isMulti) {
            const sqlList: string[] = sql.split(";").filter((s) => (s.trim() != '' && s.trim() != ';'))
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
            if (isMulti) {
                QueryPage.send({ type: MessageType.MESSAGE, res: { message: `Execute sql success : ${sql}`, costTime, success: true } as MessageResponse });
                vscode.commands.executeCommand(CommandKey.Refresh);
                return;
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
                QueryPage.send({ type: MessageType.DATA, connection: connectionNode, res: { sql, costTime, data, fields, pageSize: 100 } as DataResponse });
                return;
            }
            QueryPage.send({ type: MessageType.MESSAGE, res: { message: `Execute sql success : ${sql}`, costTime, success: true } as MessageResponse });

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
        const sqlList = content.split(";");
        const docCursor = document.getText(Cursor.getRangeStartTo(current)).length;
        let index = 0;
        for (let i = 0; i < sqlList.length; i++) {
            const sql = sqlList[i];
            index += (sql.length + 1);
            if (docCursor < index) {
                const trimSql = sql.trim();
                if (!trimSql && sqlList.length > 1) { return sqlList[i - 1]; }
                return trimSql;
            }
        }

        return '';
    }

    private static sqlDocument: vscode.TextEditor;
    public static async showSQLTextDocument(sql: string = "", template = "template.sql") {

        this.sqlDocument = await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(await FileManager.record(template, sql, FileModel.WRITE))
        );

        return this.sqlDocument;
    }

    public static async runFile(connection: Connection, fsPath: string) {
        const stats = fs.statSync(fsPath);
        const startTime = new Date();
        const fileSize = stats.size;
        if (fileSize > 1024 * 1024 * 200) {
            vscode.window.showErrorMessage(`Import sql exceed max limit 200M!`)
            // if (await this.executeByLine(connection, fsPath)) {
            //     Console.log(`import success, cost time : ${new Date().getTime() - startTime.getTime()}ms`);
            // }
        } else {
            let fileContent = fs.readFileSync(fsPath, 'utf8');
            if (Global.getConfig<boolean>(ConfigKey.ENABLE_DELIMITER)) {
                const parse = this.delimiterHodler.parseBatch(fileContent)
                fileContent = parse.sql
            }
            if (fileContent.match(Pattern.MULTI_PATTERN)) {
                await this.queryPromise(connection, fileContent)
            } else {
                const sqlList = fileContent.split(";")
                await this.runBatch(connection, sqlList)
            }
            Console.log(`import success, cost time : ${new Date().getTime() - startTime.getTime()}ms`);
            vscode.commands.executeCommand(CommandKey.Refresh)
        }

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

