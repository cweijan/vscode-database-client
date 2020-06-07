import { FieldInfo } from "mysql";
import { Console } from "../../common/outputChannel";
import { ConnectionManager } from "../connectionManager";
import { AbstractExportService } from "./abstractExportService";

export class MysqlExportService extends AbstractExportService {

    protected async exportExcel(folderPath: string, sql: string) {

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