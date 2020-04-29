import { MessageType, OperateType, ConfigKey } from "../../common/constants";
import { Node } from "../../model/interface/node";
import { ColumnNode } from "../../model/other/columnNode";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { ViewManager } from "../viewManager";
import { DataResponse } from "./queryResponse";
import { Global } from "../../common/global";
import { ExportService } from "../../service/export/exportService";
import { MysqlExportService } from "../../service/export/impl/mysqlExportService";

export class QueryParam<T> {
    /**
     * using in loadColumnList.
     */
    public connection?: Node;
    public type: MessageType;
    public res: T;
}

export class QueryPage {

    private static exportService: ExportService = new MysqlExportService()

    public static async send(queryParam: QueryParam<any>) {

        switch (queryParam.type) {
            case MessageType.DATA:
                await this.loadColumnList(queryParam);
                break;
            case MessageType.DML:
            case MessageType.DDL:
                queryParam.res.message = `EXECUTE SUCCESS:<br><br>&nbsp;&nbsp;${queryParam.res.sql}<br><br>AffectedRows : ${queryParam.res.affectedRows}, CostTime : ${queryParam.res.costTime}ms`;
                break;
            case MessageType.ERROR:
                queryParam.res.message = `EXECUTE FAIL:<br><br>&nbsp;&nbsp;${queryParam.res.sql}<br><br>Message :<br><br>&nbsp;&nbsp;${queryParam.res.message}`;
                break;
        }

        ViewManager.createWebviewPanel({
            splitView: !Global.getConfig(ConfigKey.QUERY_FULL_SCREEN),
            path: "pages/result/index", title: "Query",
            initListener: (webviewPanel) => {
                webviewPanel.webview.postMessage(queryParam);
            },
            receiveListener: async (_, params) => {
                switch (params.type) {
                    case OperateType.execute:
                        QueryUnit.runQuery(params.sql);
                        break;
                    case OperateType.export:
                        this.exportService.export(params.sql)
                        break;
                }
            }
        });

    }

    private static async loadColumnList(queryParam: QueryParam<DataResponse>) {
        const fields = queryParam.res.fields;
        const conn = queryParam.connection;
        if (!fields || fields.length == 0) { return; }
        const tableName = fields[0].orgTable;
        const database = fields[0].db;
        if (tableName == null || conn == null) { return; }
        // load table infomation
        const tableNode = DatabaseCache.getTable(`${conn.getConnectId()}_${database ? database : conn.database}`, tableName);
        if (tableNode) {
            let primaryKey: string;
            const columnList = (await tableNode.getChildren()).map((columnNode: ColumnNode) => {
                if (columnNode.column.key === "PRI") {
                    primaryKey = columnNode.column.name;
                }
                return columnNode.column;
            });
            queryParam.res.primaryKey = primaryKey;
            queryParam.res.columnList = columnList;
        }
        queryParam.res.table = tableName;
        queryParam.res.database = conn.database;
        queryParam.connection = null;
    }

}