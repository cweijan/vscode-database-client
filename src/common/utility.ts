"use strict";
import * as mysql from "mysql";
import * as vscode from "vscode";
import { Global } from "./global";
import { OutputChannel } from "./outputChannel";

export class Utility {
    public static queryPromise<T>(connection, sql: string): Promise<T> {
        return new Promise((resolve, reject) => {
            connection.query(sql, (err, rows) => {
                if (err) {
                    reject("MySQL Error: " + err.stack);
                    return;
                }
                resolve(rows);
            });
        });
    }

    public static runQuery() {
        const sql = vscode.window.activeTextEditor.document.getText();
        const connection = mysql.createConnection(Global.activeConnection);
        Utility.queryPromise<any[]>(connection, sql)
            .then((result) => {
                OutputChannel.appendLine(JSON.stringify(result, null, 2));
            })
            .catch((err) => {
                vscode.window.showErrorMessage(err);
            });
    }
}
