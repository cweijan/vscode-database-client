import { FieldInfo } from "mysql2";
import { Console } from "../../common/Console";
import { ConnectionManager } from "../connectionManager";
import { AbstractExportService } from "./abstractExportService";
import { ExportContext, ExportType } from "./exportContext";

export class MysqlExportService extends AbstractExportService {

    protected async exportData(exportOption: ExportContext) {

        const sql = exportOption.sql
        const connection = await ConnectionManager.getConnection(ConnectionManager.getLastConnectionOption())
        connection.query(sql, (err, rows, fields?: FieldInfo[]) => {
            if (err) {
                Console.log(err)
                return;
            }
            exportOption.fields=fields;
            exportOption.rows=rows;
            super.delegateExport(exportOption,rows,fields)
        })

    }

}