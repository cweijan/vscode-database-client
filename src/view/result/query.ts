import { extname, basename } from "path";
import { StatusBarAlignment, StatusBarItem, window } from "vscode";
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
import { NodeUtil } from "@/model/nodeUtil";
import { Trans } from "~/common/trans";

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
    private static statusBar: StatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, -200);
    private static costStatusBar: StatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, -250);

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
            if (queryParam.type == MessageType.DATA) {
                this.hodlder.delete(queryParam.res.sql)
            }
        }

        ViewManager.createWebviewPanel({
            singlePage: true,
            splitView: this.isActiveSql(),
            path: 'result', title,
            iconPath: Global.getExtPath("resources", "icon", "query.svg"),
            eventHandler: async (handler) => {
                handler.panel.onDidChangeViewState(e => {
                    if (!e.webviewPanel.visible) {
                        this.statusBar.hide()
                        this.costStatusBar.hide()
                    }
                })
                handler.on("init", () => {
                    if (queryParam.res?.table) {
                        handler.panel.title = `${queryParam.res.table}@${queryParam.res.database}`
                    }
                    queryParam.res.dbInfo={...ConnectionManager.getLastConnectionOption(),command:null,info:null }
                    queryParam.res.transId=Trans.transId;
                    handler.emit(queryParam.type, queryParam.res)
                }).on("showCost", ({ cost }) => {
                    this.costStatusBar.text = `$(scrollbar-button-right) ${cost}ms`
                    this.costStatusBar.show()
                }).on("showInfo", ({ table, row, col }) => {
                    this.statusBar.text = `$(list-flat) ${table}       Row ${row}, Col ${col}`
                    this.statusBar.show()
                }).on(OperateType.execute, (params) => {
                    if (!queryParam.singlePage) {
                        this.hodlder.set(params.sql.trim(), title)
                    }
                    QueryUnit.runQuery(params.sql,params.dbInfo);
                }).on(OperateType.next, async (params) => {
                    const sql = this.pageService.build(params.sql, params.pageNum, params.pageSize)
                    const connection = await ConnectionManager.getConnection(ConnectionManager.getLastConnectionOption())
                    QueryUnit.queryPromise(connection, sql).then((rows) => {
                        handler.emit(MessageType.NEXT_PAGE, { sql, data: rows })
                    })
                }).on(OperateType.export, (params) => {
                    this.exportService.export(params.option)
                })
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
        const database = fields[0].schema || fields[0].db;
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