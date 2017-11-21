"use strict";
import * as vscode from "vscode";

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
}
