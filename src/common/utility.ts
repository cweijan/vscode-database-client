"use strict";
import * as mysql from "mysql";
import * as vscode from "vscode";
import { IConnection } from "../model/connection";
import { AppInsightsClient } from "./appInsightsClient";
import { Global } from "./global";
import { OutputChannel } from "./outputChannel";

export class Utility {
    public static getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration("vscode-mysql");
    }

    public static queryPromise<T>(connection, sql: string): Promise<T> {
        return new Promise((resolve, reject) => {
            connection.query(sql, (err, rows) => {
                if (err) {
                    reject("Error: " + err.message);
                    return;
                }
                resolve(rows);
            });
        });
    }

    public static runQuery(sql?: string, connectionOptions?: IConnection) {
        AppInsightsClient.sendEvent("runQuery.start");
        if (!sql && !vscode.window.activeTextEditor) {
            vscode.window.showWarningMessage("No SQL file selected");
            return;
        }
        if (!connectionOptions && !Global.activeConnection) {
            vscode.window.showWarningMessage("No MySQL Server or Database selected");
            return;
        }

        sql = sql ? sql : vscode.window.activeTextEditor.document.getText();
        connectionOptions = connectionOptions ? connectionOptions : Global.activeConnection;
        const connection = mysql.createConnection(connectionOptions);

        OutputChannel.appendLine("[Start] Executing MySQL query...");
        Utility.queryPromise<any>(connection, sql)
            .then((result) => {
                OutputChannel.appendLine(JSON.stringify(result).replace(/},/g, "},\r\n"));
                AppInsightsClient.sendEvent("runQuery.end", { Result: "Success" });
            })
            .catch((err) => {
                OutputChannel.appendLine(err);
                AppInsightsClient.sendEvent("runQuery.end", { Result: "Fail" });
            })
            .then(() => {
                OutputChannel.appendLine("[Done] Finished MySQL query.");
            });
    }

    public static async createSQLTextDocument(sql: string = "") {
        const textDocument = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
        return vscode.window.showTextDocument(textDocument);
    }
}
