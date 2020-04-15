import { FileManager } from "./FileManager";
export class HistoryManager {

    public static showHistory() {
        FileManager.show('history.sql')
    }

    public static recordHistory(sql: string, costTime: number) {
        if (!sql) { return; }
        FileManager.record('history.sql', `/* ${this.getNowDate()} [${costTime} ms] */ ${sql.replace(/[\r\n]/g, " ")}\n`);
    }

    private static getNowDate(): string {
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

    public static pad(n: any, width: number, z?: any): number {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    }

}