import { extname, basename } from "path";
import { window } from "vscode";
import { MessageType, OperateType, ConfigKey } from "../../common/constants";
import { Node } from "../../model/interface/node";
import { ColumnNode } from "../../model/other/columnNode";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { ExportService } from "../../service/export/exportService";
import { MysqlExportService } from "../../service/export/mysqlExportService";
import { MysqlPageSerivce } from "../../service/page/mysqlPageSerivce";
import { PageService } from "../../service/page/pageService";
import { QueryUnit } from "../../service/queryUnit";
import { ViewManager } from "../viewManager";
import { DataResponse } from "./queryResponse";
import { Global } from "../../common/global";

export class QueryParam<T> {
    /**
     * using in loadColumnList.
     */
    public connection?: Node;
    public singlePage?: boolean;
    public type: MessageType;
    public res: T;
}

export class QueryPage {

    private static exportService: ExportService = new MysqlExportService()
    private static pageService: PageService = new MysqlPageSerivce()
    private static hodlder: Map<string, string> = new Map()

    public static async send(queryParam: QueryParam<any>) {

        if (typeof queryParam.singlePage == 'undefined') {
            queryParam.singlePage = true;
        }

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


        let title = queryParam.singlePage ? "Query" : "Query" + new Date().getTime();
        const olderTitle = this.hodlder.get(queryParam.res.sql);
        if (olderTitle) {
            title = olderTitle
            queryParam.singlePage = false
            if(queryParam.type==MessageType.DATA){
                this.hodlder.delete(queryParam.res.sql)
            }
        }

        ViewManager.createWebviewPanel({
            singlePage: true,
            splitView: this.isActiveSql(),
            path:'result', title,
            iconPath: Global.getExtPath("resources", "icon", "query.svg"),
            initListener: (webviewPanel) => {
                if (queryParam.res?.table) {
                    webviewPanel.title = queryParam.res.table
                }
                webviewPanel.webview.postMessage(queryParam);
            },
            receiveListener: async (viewPanel, params) => {
                switch (params.type) {
                    case OperateType.execute:
                        if (!queryParam.singlePage) {
                            this.hodlder.set(params.sql.trim(), title)
                        }
                        QueryUnit.runQuery(params.sql);
                        break;
                    case OperateType.next:
                        const sql = this.pageService.build(params.sql, params.pageNum, params.pageSize)
                        const connection = await ConnectionManager.getConnection(ConnectionManager.getLastConnectionOption())
                        QueryUnit.queryPromise(connection, sql).then((rows) => {
                            viewPanel.webview.postMessage({ type: MessageType.NEXT_PAGE, res: { sql, data: rows } as DataResponse });
                        })
                        break;
                    case OperateType.export:
                        this.exportService.export(params.option)
                        break;
                }
            }
        });

    }

    private static isActiveSql(): boolean {

        if (!window.activeTextEditor || !window.activeTextEditor.document) { return false; }

        const extName = extname(window.activeTextEditor.document.fileName)?.toLowerCase()
        const fileName = basename(window.activeTextEditor.document.fileName)?.toLowerCase()

        return extName == '.sql' || fileName == 'mock.json';
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