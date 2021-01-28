
import * as vscode from "vscode";
import { Position, TextDocument } from "vscode";
import { Confirm, DatabaseType } from "./constants";
import { wrapByDb } from "./wrapper.js";

export class Util {

    public static getTableName(sql: string, tablePattern: string): string {

        const tableMatch = new RegExp(tablePattern, 'img').exec(sql)
        if (tableMatch) {
            return tableMatch[0].replace(/\bfrom|join|update|into\b/i, "") // remove keyword
                .replace(/`|"|'/g, "")// trim tableName
                .replace(/^\s*\[(.+)\]$/, "$1") // trim tableName again
                .trim()
        }

        return null;
    }

    /**
     * wrap origin with ` if is unusual identifier
     * @param origin any string
     */
    public static wrap(origin: string, databaseType?: DatabaseType) {
        return wrapByDb(origin, databaseType)
    }

    public static trim(origin: any): any {

        if (origin) {
            const originType = typeof origin
            if (originType == "string") {
                return origin.trim()
            }
            if (originType == "object") {
                for (const key in origin) {
                    origin[key] = this.trim(origin[key])
                }
            }
        }

        return origin
    }

    /**
     * trim array, got from SO.
     * @param origin origin array
     * @param attr duplicate check attribute
     */
    public static trimArray<T>(origin: T[], attr: string): T[] {
        const seen = new Set();
        return origin.filter((item) => {
            const temp = item[attr];
            return seen.has(temp) ? false : seen.add(temp);
        });
    }

    public static getDocumentLastPosition(document: TextDocument): Position {
        const lastLine = document.lineCount - 1;
        return new Position(lastLine, document.lineAt(lastLine).text.length);
    }

    public static copyToBoard(content: string) {
        vscode.env.clipboard.writeText(content)
    }

    public static confirm(placeHolder: string, callback: () => void) {
        vscode.window.showQuickPick([Confirm.YES, Confirm.NO], { placeHolder }).then((res) => {
            if (res == Confirm.YES) {
                callback()
            }
        })
    }

    public static async(callback: (res, rej) => void): Promise<any> {
        return new Promise((resolve, reject) => callback(resolve, reject))
    }

    public static process(title: string, task: (done) => void) {
        vscode.window.withProgress({ title, location: vscode.ProgressLocation.Notification }, () => {
            return new Promise(async (resolve) => {
                try {
                    task(resolve)
                } catch (error) {
                    vscode.window.showErrorMessage(error.message)
                } 
            })
        })
    }

}