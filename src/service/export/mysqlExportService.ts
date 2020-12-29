import { FieldInfo } from "mysql2";
import { Console } from "../../common/Console";
import { ConnectionManager } from "../connectionManager";
import { AbstractExportService } from "./abstractExportService";
import { ExportOption, ExportType } from "./exportOption";

export class MysqlExportService extends AbstractExportService {

    protected async exportData(exportOption: ExportOption) {

        const filePath = exportOption.exportPath
        const sql = exportOption.sql
        const connection = await ConnectionManager.getConnection(ConnectionManager.getLastConnectionOption())
        connection.query(sql, (err, rows, fields?: FieldInfo[]) => {
            if (err) {
                Console.log(err)
                return;
            }
            switch (exportOption.type) {
                case ExportType.excel:
                    super.exportByNodeXlsx(filePath, fields, rows);
                    break;
                case ExportType.csv:
                    super.exportToCsv(filePath, fields, rows);
                    break;
            }
            
        })

    }

}