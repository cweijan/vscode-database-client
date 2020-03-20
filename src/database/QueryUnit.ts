"use strict";
import * as vscode from "vscode";
import * as fs from "fs";
import { Cursor, CommandKey } from "../common/Constants";
import { Console } from "../common/OutputChannel";
import { Util } from "../common/util";
import { IConnection } from "../model/Connection";
import { ConnectionManager } from "./ConnectionManager";
import { SqlViewManager } from "./SqlViewManager";

export class QueryUnit {

    public static readonly maxTableCount = QueryUnit.getConfiguration().get<number>("maxTableCount");

    public static getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration("vscode-mysql");
    }

    public static queryPromise<T>(connection, sql: string): Promise<T> {
        return new Promise((resolve, reject) => {
            // Console.log(`Execute SQL:${sql}`)
            connection.query(sql, (err, rows) => {
                if (err) {
                    Console.log(err)
                    reject("Error: " + err.message);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    private static ddlPattern = /^(alter|create|drop)/ig;
    public static async runQuery(sql?: string, connectionOptions?: IConnection) {
        if (!sql && !vscode.window.activeTextEditor) {
            vscode.window.showWarningMessage("No SQL file selected");
            return;
        }
        let connection: any;
        if (!connectionOptions && !(connection = await ConnectionManager.getLastActiveConnection())) {
            vscode.window.showWarningMessage("No MySQL Server or Database selected");
            return;
        } else if (connectionOptions) {
            connectionOptions.multipleStatements = true;
            connection = await ConnectionManager.getConnection(connectionOptions)
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
        sql = sql.replace(/--.+/ig, '');
        let executeTime = new Date().getTime()
        connection.query(sql, (err, data) => {
            if (err) {
                //TODO trans output to query page
                Console.log(err);
                return;
            }
            var costTime = new Date().getTime() - executeTime
            if (fromEditor)
                vscode.commands.executeCommand(CommandKey.RecordHistory, sql, costTime)
            if (sql.match(this.ddlPattern)) {
                vscode.commands.executeCommand(CommandKey.Refresh)
                return;
            }
            if (Array.isArray(data)) {
                SqlViewManager.showQueryResult({ sql, data, splitResultView: true, costTime: costTime });
            } else {
                Console.log(`execute sql success:${sql}`)
            }
        });
    }


    private static batchPattern = /(TRIGGER|PROCEDURE|FUNCTION)/ig
    private static obtainSql(activeTextEditor: vscode.TextEditor): string {

        var content = activeTextEditor.document.getText()
        if (content.match(this.batchPattern)) return content;

        var sqlList = content.split(";");
        var doc_cursor = activeTextEditor.document.getText(Cursor.getRangeStartTo(activeTextEditor.selection.active)).length;
        var index = 0;
        for (let sql of sqlList) {
            index += (sql.length + 1)
            if (doc_cursor < index) {
                return sql.trim() + ";";
            }
        }

        return '';
    }

    public static async createSQLTextDocument(sql: string = "") {
        const textDocument = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
        return vscode.window.showTextDocument(textDocument);
    }


    private static sqlDocument: vscode.TextEditor;
    public static async showSQLTextDocument(sql: string = "") {

        if (this.sqlDocument && !this.sqlDocument.document.isClosed && !this.sqlDocument['_disposed'] && this.sqlDocument.document.isUntitled) {
            this.sqlDocument.edit((editBuilder) => {
                editBuilder.replace(Cursor.getRangeStartTo(Util.getDocumentLastPosition(this.sqlDocument.document)), sql);
            })
        } else {
            const textDocument = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
            this.sqlDocument = await vscode.window.showTextDocument(textDocument)
        }
        return this.sqlDocument;
    }

    static runFile(connection: any, fsPath: string) {
        var stats = fs.statSync(fsPath)
        var startTime = new Date()
        var fileSize = stats["size"]
        let success = true;
        if (fileSize > 1024 * 1024 * 100) {
            success = this.executeByLine(connection, fsPath)
        } else {
            var fileContent = fs.readFileSync(fsPath, 'utf8')
            connection.query(fileContent, (err, data) => {
                if (err) {
                    Console.log(err)
                    success = false;
                }
            })
        }
        if (success)
            Console.log(`import success, cost time : ${new Date().getTime() - startTime.getTime()}ms`)

    }

    private static executeByLine(connection: any, fsPath: string) {
        var readline = require('readline');
        var rl = readline.createInterface({
            input: fs.createReadStream(fsPath.replace("\\", "/")),
            terminal: false
        });
        rl.on('line', (chunk) => {
            let sql = chunk.toString('utf8');
            connection.query(sql, (err, sets, fields) => {
                if (err) Console.log(`execute sql ${sql} fail,${err}`)
            });
        });
        return true;
    }

}

