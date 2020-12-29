import * as vscode from "vscode";
import { ExportService } from "./exportService";
import { FieldInfo } from "mysql2";
import * as fs from "fs";
import { Console } from "../../common/Console";
import { ExportContext, ExportType } from "./exportContext";

export abstract class AbstractExportService implements ExportService {

    public export(exportOption: ExportContext): void {
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


    protected abstract exportData(exportOption: ExportContext): void;

    protected delegateExport(context: ExportContext, rows: any, fields: FieldInfo[]) {
        const filePath = context.exportPath;
        Console.log(`start export data to ${context.type}...`)
        switch (context.type) {
            case ExportType.excel:
                this.exportByNodeXlsx(filePath, fields, rows);
                break;
            case ExportType.csv:
                this.exportToCsv(filePath, fields, rows);
                break;
            case ExportType.sql:
                this.exportToSql(context);
                break;
        }
        Console.log(`export ${context.type} success, path is ${context.exportPath}!`)
    }

    private exportToSql(exportContext: ExportContext) {

        const {rows,exportPath}=exportContext;
        if (rows.length == 0) {
            // show waraing
            return;
        }

        let sql = ``;
        for (const row of rows) {
            let columns = "";
            let values = "";
            for (const key in row) {
                columns += `\`${key}\`,`
                values += `'${row[key]}',`
            }
            sql += `insert into ${exportContext.table}(${columns.replace(/.$/, '')}) values(${values.replace(/.$/, '')});\n`
        }
        fs.writeFileSync(exportPath, sql);
        

    }

    private exportByNodeXlsx(filePath: string, fields: FieldInfo[], rows: any) {
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
    }

    private exportToCsv(filePath: string, fields: FieldInfo[], rows: any) {
        let csvContent = "";
        for (const row of rows) {
            for (const key in row) {
                csvContent += `${row[key]},`
            }
            csvContent = csvContent.replace(/.$/, "") + "\n"
        }
        fs.writeFileSync(filePath, csvContent);
    }


}