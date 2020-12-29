import * as vscode from "vscode";
import { ExportService } from "./exportService";
import { FieldInfo } from "mysql2";
import * as fs from "fs";
import { Console } from "../../common/Console";
import { ExportOption, ExportType } from "./exportOption";

export abstract class AbstractExportService implements ExportService {
    public export(exportOption: ExportOption): void {
        const randomFileName = `${new Date().getTime()}.${exportOption.type}`

        vscode.window.showSaveDialog({ saveLabel: "Select export file path", defaultUri: vscode.Uri.file(randomFileName), filters: { 'file': [exportOption.type] } }).then((filePath) => {
            if (filePath) {
                exportOption.exportPath = filePath.fsPath;
                if (exportOption.withOutLimit) {
                    exportOption.sql = exportOption.sql.replace(/\blimit\b.+/gi, "")
                }
                this.exportData(exportOption)
            }
        })
    }


    protected abstract exportData(exportOption: ExportOption): void;

    protected exportByNodeXlsx(filePath: string, fields: FieldInfo[], rows: any) {
        Console.log("start export data to excel...")
        const nodeXlsx = require('node-xlsx');
        fs.writeFileSync(filePath, nodeXlsx.build([{
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

    protected exportToCsv(filePath: string, fields: FieldInfo[], rows: any) {
        Console.log("start export data to csv...")
        let csvContent="";
        for (const row of rows) {
            for (const key in row) {
                csvContent+=`${row[key]},`
            }
            csvContent=csvContent.replace(/.$/,"")+"\n"
        }
        fs.writeFileSync(filePath, csvContent);
        Console.log("export success!")
    }


}