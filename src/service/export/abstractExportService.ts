import * as vscode from "vscode";
import { ExportService } from "./exportService";
import { FieldInfo } from "mysql";
import * as fs from "fs";
import { Console } from "../../common/outputChannel";

export abstract class AbstractExportService implements ExportService {
    public export(sql: string): void {
        vscode.window.showOpenDialog({ canSelectMany: false, openLabel: "Select export file path", canSelectFiles: false, canSelectFolders: true }).then((folderPath) => {
            if (folderPath) {
                this.exportExcel(folderPath[0].fsPath, sql)
            }
        });
    }


    protected abstract exportExcel(folderPath: string, sql: string): void;

    protected exportByNodeXlsx(folderPath: string, fields: FieldInfo[], rows: any) {
        Console.log("start export data...")
        const nodeXlsx = require('node-xlsx');
        fs.writeFileSync(`${folderPath}/${new Date().getTime()}.xlsx`, nodeXlsx.build([{
            name: "sheet1",
            data: [
                fields.map((field) => field.name),
                ...rows.map((row) => {
                    const values = [];
                    for (const key in row) {
                        values.push(row[key]);
                    }
                    return values;
                })
            ]
        }]), "binary");
        Console.log("export success!")
    }

}