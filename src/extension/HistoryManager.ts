import * as fs from "fs";
import * as vscode from "vscode";
import { Console } from "../common/OutputChannel";
import { QueryUnit } from "../database/QueryUnit";
export class HistoryManager {

    constructor(private context: vscode.ExtensionContext) {
    }

    showHistory() {
        var historyPath = this.context.globalStoragePath + '/history.sql'
        if (fs.existsSync(historyPath)) {
            QueryUnit.showSQLTextDocument(fs.readFileSync(historyPath, { encoding: 'utf8' }))
        } else {
            Console.log("history is empty.")
        }
    }

    recordHistory(sql: string) {
        if (!sql) return;
        return new Promise(() => {
            var gsPath = this.context.globalStoragePath
            if (!fs.existsSync(gsPath)) {
                fs.mkdirSync(gsPath)
            }
            fs.appendFileSync(gsPath + '/history.sql', `/*${this.getNowDate()}*/ ${sql}\n`, { encoding: 'utf8' });

        })
    }

    private getNowDate(): string {
        const date = new Date();
        let month: string | number = date.getMonth() + 1;
        let strDate: string | number = date.getDate();

        if (month <= 9) {
            month = "0" + month;
        }

        if (strDate <= 9) {
            strDate = "0" + strDate;
        }

        return date.getFullYear() + "-" + month + "-" + strDate + " "
            + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
    }
}