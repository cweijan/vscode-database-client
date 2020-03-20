import * as fs from "fs";
import * as vscode from "vscode";
export class HistoryManager {

    constructor(private context: vscode.ExtensionContext) {
    }

    showHistory() {
        var historyPath = this.context.globalStoragePath + '/history.sql'
        var openPath = vscode.Uri.file(historyPath);
        vscode.workspace.openTextDocument(openPath).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    }

    recordHistory(sql: string, costTime: number) {
        if (!sql) return;
        return new Promise(() => {
            var gsPath = this.context.globalStoragePath
            if (!fs.existsSync(gsPath)) {
                fs.mkdirSync(gsPath)
            }
            fs.appendFileSync(gsPath + '/history.sql', `/*${this.getNowDate()} [${costTime} ms] */ ${sql}\n`, { encoding: 'utf8' });

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
            + this.pad(date.getHours(), 2) + ":" + this.pad(date.getMinutes(), 2) + ":" + this.pad(date.getSeconds(), 2);
    }

    pad(n: any, width: number, z?: any): number {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    }

}