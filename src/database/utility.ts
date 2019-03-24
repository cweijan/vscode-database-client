"use strict";
import * as fs from "fs";
import * as mysql from "mysql";
import * as path from 'path';
import * as vscode from "vscode";
import { IConnection } from "../model/connection";
import { AppInsightsClient } from "../common/appInsightsClient";
import { Global } from "../common/global";
import { OutputChannel } from "../common/outputChannel";
import { resolve } from "url";
import { SqlViewManager } from "./SqlViewManager";

export class Utility {
    public static readonly maxTableCount = Utility.getConfiguration().get<number>("maxTableCount");

    public static getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration("vscode-mysql");
    }

    public static queryPromise<T>(connection, sql: string): Promise<T> {
        return new Promise((resolve, reject) => {
            OutputChannel.appendLine(`Execute SQL:${sql}`)
            connection.query(sql, (err, rows) => {
                if (err) {
                    OutputChannel.appendLine(err)
                    reject("Error: " + err.message);
                } else {
                    resolve(rows);
                }
            });
            connection.end();
        });
    }

    public static async runQuery(sql?: string, connectionOptions?: IConnection) {
        AppInsightsClient.sendEvent("runQuery.start");
        if (!sql && !vscode.window.activeTextEditor) {
            vscode.window.showWarningMessage("No SQL file selected");
            AppInsightsClient.sendEvent("runQuery.noFile");
            return;
        }
        if (!connectionOptions && !Global.activeConnection) {
            const hasActiveConnection = await Utility.hasActiveConnection();
            if (!hasActiveConnection) {
                vscode.window.showWarningMessage("No MySQL Server or Database selected");
                AppInsightsClient.sendEvent("runQuery.noMySQL");
                return;
            }
        }

        if (!sql) {
            const activeTextEditor = vscode.window.activeTextEditor;
            const selection = activeTextEditor.selection;
            if (selection.isEmpty) {
                sql = activeTextEditor.document.getText();
            } else {
                sql = activeTextEditor.document.getText(selection);
            }
        }

        connectionOptions = connectionOptions ? connectionOptions : Global.activeConnection;
        connectionOptions.multipleStatements = true;
        const connection = Utility.createConnection(connectionOptions);

        connection.query(sql, (err, rows) => {
            if (Array.isArray(rows)) {
                if (rows.some(((row) => Array.isArray(row)))) {
                    rows.forEach((row, index) => {
                        if (Array.isArray(row)) {
                            Utility.showQueryResult(row);
                        } else {
                            OutputChannel.appendLine(JSON.stringify(row));
                        }
                    });
                } else {
                    Utility.showQueryResult(rows);
                }

            } else {
                OutputChannel.appendLine(JSON.stringify(rows));
            }

            if (err) {
                OutputChannel.appendLine(err);
                AppInsightsClient.sendEvent("runQuery.end", { Result: "Fail", ErrorMessage: err });
            } else {
                AppInsightsClient.sendEvent("runQuery.end", { Result: "Success" });
            }
        });
        connection.end();
    }

    public static async createSQLTextDocument(sql: string = "") {
        const textDocument = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
        return vscode.window.showTextDocument(textDocument);
    }

    public static createConnection(connectionOptions: IConnection): any {
        const newConnectionOptions: any = Object.assign({}, connectionOptions);
        if (connectionOptions.certPath && fs.existsSync(connectionOptions.certPath)) {
            newConnectionOptions.ssl = {
                ca: fs.readFileSync(connectionOptions.certPath),
            };
        }
        return mysql.createConnection(newConnectionOptions);
    }

    private static getPreviewUri(data) {
        const uri = vscode.Uri.parse("sqlresult://mysql/data");

        return uri.with({ query: data });
    }

    static webviewPanel: vscode.WebviewPanel;

    private static showQueryResult(data) {

        SqlViewManager.showQueueResult(data,"test")

    };



    private static async hasActiveConnection(): Promise<boolean> {
        let count = 5;
        while (!Global.activeConnection && count > 0) {
            await Utility.sleep(100);
            count--;
        }
        return !!Global.activeConnection;
    }

    private static sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}
