import { FieldInfo } from "mysql";
import { Console } from "../../common/Console";
import { ConnectionManager } from "../connectionManager";
import { AbstractExportService } from "./abstractExportService";
import { ExportOption } from "./exportOption";

export class MysqlExportService extends AbstractExportService {

    protected async exportExcel(exportOption: ExportOption) {

        const filePath = exportOption.exportPath
        const sql = exportOption.sql
        const connection = await ConnectionManager.getConnection(ConnectionManager.getLastConnectionOption())
        connection.query(sql, (err, rows, fields?: FieldInfo[]) => {
            if (err) {
                Console.log(err)
                return;
            }
            super.exportByNodeXlsx(filePath, fields, rows);
        })

    }

}