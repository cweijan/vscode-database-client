import * as vscode from "vscode";
import { ExportService } from "./exportService";
import { FieldInfo } from "mysql";
import * as fs from "fs";
import { Console } from "../../common/outputChannel";
import { ExportOption } from "./exportOption";

export abstract class AbstractExportService implements ExportService {
    public export(exportOption: ExportOption): void {
        const randomFileName=`${new Date().getTime()}.xlsx`

        vscode.window.showSaveDialog({ saveLabel: "Select export file path", defaultUri: vscode.Uri.file(randomFileName), filters: { 'xlsx': ['xlsx'] } }).then((filePath) => {
            if (filePath) {
                exportOption.exportPath=filePath.fsPath;
                if(exportOption.withOutLimit){
                    exportOption.sql=exportOption.sql.replace(/\blimit\b.+/gi, "")
                }
                this.exportExcel(exportOption)
            }
        })
    }


    protected abstract exportExcel(exportOption:ExportOption): void;

    protected exportByNodeXlsx(filePath: string, fields: FieldInfo[], rows: any) {
        Console.log("start export data...")
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

}