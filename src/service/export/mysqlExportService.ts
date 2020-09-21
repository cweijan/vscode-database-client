import { FieldInfo } from "mysql";
import { Console } from "../../common/outputChannel";
import { ConnectionManager } from "../connectionManager";
import { AbstractExportService } from "./abstractExportService";
import { ExportOption } from "./exportOption";

export class MysqlExportService extends AbstractExportService {

    protected async exportExcel(exportOption: ExportOption) {

        const folderPath = exportOption.folderPath
        const sql = exportOption.sql
        const connection = await ConnectionManager.getConnection(ConnectionManager.getLastConnectionOption())
        connection.query(sql, (err, rows, fields?: FieldInfo[]) => {
            if (err) {
                Console.log(err)
                return;
            }
            super.exportByNodeXlsx(folderPath, fields, rows);
        })

    }

}