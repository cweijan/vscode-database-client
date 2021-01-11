import { ServiceManager } from "@/service/serviceManager";
import { basename, extname } from "path";
import { env, StatusBarAlignment, StatusBarItem, Uri, window } from "vscode";
import { Trans } from "~/common/trans";
import { ConfigKey, MessageType, OperateType } from "../../common/constants";
import { Global } from "../../common/global";
import { Node } from "../../model/interface/node";
import { ColumnNode } from "../../model/other/columnNode";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ExportService } from "../../service/export/exportService";
import { MysqlExportService } from "../../service/export/mysqlExportService";
import { QueryUnit } from "../../service/queryUnit";
import { ViewManager } from "../viewManager";
import { DataResponse } from "./queryResponse";

export class QueryParam<T> {
    public connection: Node;
    public singlePage?: boolean;
    public type: MessageType;
    public res: T;
}

export class QueryPage {

    private static exportService: ExportService = new MysqlExportService()
    private static hodlder: Map<string, string> = new Map()
    private static statusBar: StatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, -200);
    private static costStatusBar: StatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, -250);

    public static async send(queryParam: QueryParam<any>) {

        const dbOption: Node = queryParam.connection;
        await QueryPage.adaptData(queryParam);
        this.updateStatusBar(queryParam);
        const type = this.keepSingle(queryParam);

        ViewManager.createWebviewPanel({
            singlePage: true,
            splitView: this.isActiveSql(),
            path: 'result', title: 'Query', type,
            iconPath: Global.getExtPath("resources", "icon", "query.svg"),
            eventHandler: async (handler) => {
                handler.panel.onDidChangeViewState(e => {
                    if (!e.webviewPanel.visible) {
                        this.statusBar.hide()
                        this.costStatusBar.hide()
                    } else {
                        this.updateStatusBar(queryParam);
                    }
                })
                handler.on("init", () => {
                    if (queryParam.res?.table) {
                        handler.panel.title = `${queryParam.res.table}@${dbOption.database}`
                    }
                    queryParam.res.transId = Trans.transId;
                    handler.emit(queryParam.type, { ...queryParam.res, dbType: dbOption.dbType })
                }).on(OperateType.execute, (params) => {
                    if (!queryParam.singlePage) {
                        this.hodlder.set(params.sql.trim(), type)
                    }
                    QueryUnit.runQuery(params.sql, dbOption);
                }).on(OperateType.next, async (params) => {
                    const sql = ServiceManager.getPageService(dbOption.dbType).build(params.sql, params.pageNum, params.pageSize)
                    dbOption.execute(sql).then((rows) => {
                        handler.emit(MessageType.NEXT_PAGE, { sql, data: rows })
                    })
                }).on('count', async (params) => {
                    dbOption.execute(params.sql).then((rows) => {
                        handler.emit('COUNT', { data: rows[0].count })
                    })
                }).on(OperateType.export, (params) => {
                    this.exportService.export(params.option).then(() => {
                        handler.emit('EXPORT_DONE')
                    })
                }).on('changePageSize', (pageSize) => {
                    Global.updateConfig(ConfigKey.DEFAULT_LIMIT, pageSize)
                }).on('openCoffee', () => {
                    env.openExternal(Uri.parse('https://www.buymeacoffee.com/cweijan'));
                })
            }
        });

    }

    private static async adaptData(queryParam: QueryParam<any>) {
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
    }

    private static keepSingle(queryParam: QueryParam<any>) {
        if (typeof queryParam.singlePage == 'undefined') {
            queryParam.singlePage = true;
        }
        let type = queryParam.singlePage ? "Query" : "Query" + new Date().getTime();
        const olderTitle = this.hodlder.get(queryParam.res.sql);
        if (olderTitle) {
            type = olderTitle;
            queryParam.singlePage = false;
            if (queryParam.type == MessageType.DATA) {
                this.hodlder.delete(queryParam.res.sql);
            }
        }
        return type;
    }

    private static updateStatusBar(queryParam: QueryParam<any>) {
        if (queryParam.type != MessageType.RUN && queryParam.res.costTime) {
            this.costStatusBar.text = `$(scrollbar-button-right) ${queryParam.res.costTime}ms`;
            this.costStatusBar.show();
        }
        if (queryParam.type == MessageType.DATA) {
            this.statusBar.text = `$(list-flat) ${queryParam.res.table}       Row ${queryParam.res.data?.length}, Col ${queryParam.res.fields?.length}`;
            this.statusBar.show();
        }
    }

    private static isActiveSql(): boolean {

        if (!window.activeTextEditor || !window.activeTextEditor.document) { return false; }

        const extName = extname(window.activeTextEditor.document.fileName)?.toLowerCase()
        const fileName = basename(window.activeTextEditor.document.fileName)?.toLowerCase()

        return extName == '.sql' || fileName == 'mock.json';
    }

    private static async loadColumnList(queryParam: QueryParam<DataResponse>) {
        // fix null point on result view
        queryParam.res.columnList = []
        const sqlList = queryParam.res.sql.match(/(?<=\b(from|join)\b\s*)(\S+)/gi)
        if (!sqlList || sqlList.length == 0) {
            return;
        }

        let conn = queryParam.connection;
        let tableName = sqlList[0]
        let database: string;

        // mysql直接从结果集拿
        const fields = queryParam.res.fields
        if (fields && fields[0]?.orgTable) {
            tableName = fields[0].orgTable;
            database = fields[0].schema || fields[0].db;
        }

        let tableNode = DatabaseCache.getTable(`${conn.getConnectId()}_${database ? database : conn.database}`, tableName);
        if (!tableNode) {
            const tables = tableName.split('.')
            tableNode = DatabaseCache.getTable(`${conn.getConnectId()}_${tables.unshift()}`, tables.join("."));
        }

        if (tableNode) {
            let primaryKey: string;
            const columnList = (await tableNode.getChildren()).map((columnNode: ColumnNode) => {
                if (columnNode.isPrimaryKey) {
                    primaryKey = columnNode.column.name;
                }
                return columnNode.column;
            });
            queryParam.res.primaryKey = primaryKey;
            queryParam.res.columnList = columnList;
        }
        queryParam.res.tableCount = sqlList.length;
        queryParam.res.table = tableName;
    }

}