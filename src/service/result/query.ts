import { FieldInfo } from "@/common/typeDef";
import { Util } from "@/common/util";
import { EsRequest } from "@/model/es/esRequest";
import { ServiceManager } from "@/service/serviceManager";
import { basename, extname } from "path";
import { commands, env, Uri, ViewColumn, WebviewPanel, window, workspace } from "vscode";
import { Trans } from "@/common/trans";
import { ConfigKey, Constants, DatabaseType, MessageType } from "../../common/constants";
import { Global } from "../../common/global";
import { ViewManager } from "../../common/viewManager";
import { Node } from "../../model/interface/node";
import { ColumnNode } from "../../model/other/columnNode";
import { ExportService } from "../export/exportService";
import { QueryOption, QueryUnit } from "../queryUnit";
import { DataResponse, ErrorResponse } from "./queryResponse";
import { ResourceServer } from "../resourceServer";
import { localize } from "vscode-nls-i18n";
import { matchBlackList } from "./black";

export class QueryParam<T> {
    public connection: Node;
    public singlePage?: boolean;
    public type: MessageType;
    public res: T;
    public queryOption?: QueryOption;
}

export class QueryPage {

    private static exportService: ExportService = new ExportService()
    private static activeViewId: any = "-1";

    public static async send(queryParam: QueryParam<any>) {

        if (matchBlackList()) {
            return;
        }

        const dbOption: Node = queryParam.connection;
        await QueryPage.adaptData(queryParam);
        const type = this.keepSingle(queryParam);
        const fontSize = workspace.getConfiguration("terminal.integrated").get("fontSize", 16)
        const fontFamily = workspace.getConfiguration("editor").get("fontFamily")

        const isActive = this.isActiveSql(queryParam.queryOption);
        ViewManager.createWebviewPanel({
            singlePage: true,
            vertical: Global.getConfig("verticalEditor"),
            splitView: isActive,
            path: 'result', title: localize('ext.view.data'), type,
            iconPath: Global.getExtPath("resources", "icon", "query.svg"),
            handleHtml: this.handleHtml,
            eventHandler: async (handler) => {
                handler.on("init", () => {
                    if (queryParam.res?.table) {
                        handler.panel.title = queryParam.res.table;
                    }
                    queryParam.res.transId = Trans.transId;
                    queryParam.res.viewId = queryParam.queryOption?.viewId;
                    const uglyPath = handler.panel.webview.asWebviewUri(Uri.file(Global.getExtPath('out', 'webview', 'ugly.jpg'))).toString();
                    handler.emit(queryParam.type, {
                        ...queryParam.res, dbType: dbOption.dbType, single: queryParam.singlePage, language: env.language, fontFamily, fontSize,
                        showUgly: Global.getConfig("showUgly", false), uglyPath
                    })
                }).on('execute', (params) => {
                    QueryUnit.runQuery(params.sql, dbOption, queryParam.queryOption);
                }).on('next', async (params) => {
                    const executeTime = new Date().getTime();
                    const sql = ServiceManager.getPageService(dbOption.dbType).build(params.sql, params.pageNum, params.pageSize)
                    dbOption.execute(sql).then((rows) => {
                        const costTime = new Date().getTime() - executeTime;
                        handler.emit(MessageType.NEXT_PAGE, { sql, data: rows, costTime })
                    })
                }).on("lock", () => {
                    const viewId = queryParam.queryOption.viewId;
                    QueryPage.activeViewId = viewId;
                    handler.emit("lock", true)
                }).on("unLock", () => {
                    if (QueryPage.activeViewId == queryParam.queryOption.viewId) {
                        QueryPage.activeViewId = undefined;
                    }
                    handler.emit("lock", false)
                }).on("full", () => {
                    // fix editor disappear
                    const ace = window.activeTextEditor;
                    if (ace) commands.executeCommand("workbench.action.keepEditor", ace.document.uri)
                    handler.panel.reveal()
                    commands.executeCommand("workbench.action.joinAllGroups")
                }).on("getLockState", () => {
                    handler.emit("lock", QueryPage.activeViewId == queryParam.queryOption.viewId)
                }).on('esFilter', (query) => {
                    const esQuery = EsRequest.build(queryParam.res.sql, obj => {
                        obj.query = query;
                    })
                    QueryUnit.runQuery(esQuery, dbOption, queryParam.queryOption);
                }).on('esSort', (sort) => {
                    const esQuery = EsRequest.build(queryParam.res.sql, obj => {
                        obj.sort = sort;
                    })
                    QueryUnit.runQuery(esQuery, dbOption, queryParam.queryOption);
                }).on('copy', value => {
                    Util.copyToBoard(value)
                }).on('count', async (params) => {
                    const autoCount = Global.getConfig('autoGetTableCount', true);
                    if (!autoCount) return;
                    if (dbOption.dbType == DatabaseType.MONGO_DB) {
                        const sql = params.sql.replace(/(.+?find\(.+?\)).+/i, '$1').replace("find", "count");
                        dbOption.execute(sql).then((count) => {
                            handler.emit('COUNT', { data: count })
                        })
                    } else {
                        dbOption.execute(params.sql.replace(/\bSELECT\b.+?\bFROM\b/i, 'select count(*) count from')).then((rows) => {
                            handler.emit('COUNT', { data: rows[0].count })
                        })
                    }
                }).on('export', (params) => {
                    this.exportService.export({ ...params.option, request: queryParam.res.request, dbOption }).then(() => {
                        handler.emit('EXPORT_DONE')
                    })
                }).on('changePageSize', (pageSize) => {
                    Global.updateConfig(ConfigKey.DEFAULT_LIMIT, pageSize)
                }).on('openGithub', () => {
                    env.openExternal(Uri.parse('https://github.com/cweijan/vscode-database-client'));
                }).on('openCoffee', () => {
                    env.openExternal(Uri.parse('https://www.buymeacoffee.com/cweijan'));
                }).on('dataModify', () => {
                    if (handler.panel.title.indexOf("*") == -1) handler.panel.title = `${handler.panel.title}*`
                }).on("saveModify", (sql) => {
                    dbOption.execute(sql).then(() => {
                        handler.emit('updateSuccess')
                        handler.panel.title = handler.panel.title.replace("*", "")
                    }).catch(err => {
                        QueryPage.send({
                            connection: queryParam.connection, type: MessageType.ERROR, queryOption: queryParam.queryOption,
                            res: { sql, message: err.message } as ErrorResponse
                        });
                    })
                })
            }
        });

    }

    private static async adaptData(queryParam: QueryParam<any>) {
        switch (queryParam.type) {
            case MessageType.DATA:
                if (queryParam.connection.dbType == DatabaseType.ES) {
                    await this.loadEsColumnList(queryParam);
                } else if (queryParam.connection.dbType == DatabaseType.MONGO_DB) {
                    await this.loadMongoColumnList(queryParam);
                } else {
                    await this.loadColumnList(queryParam);
                }
                this.createColumnTypeMap(queryParam)
                const pageSize = ServiceManager.getPageService(queryParam.connection.dbType).getPageSize(queryParam.res.sql);
                ((queryParam.res) as DataResponse).pageSize = (queryParam.res.data?.length && queryParam.res.data.length > pageSize)
                    ? queryParam.res.data.length : pageSize;
                break;
            case MessageType.MESSAGE_BLOCK:
                queryParam.res.message = `EXECUTE SUCCESS:<br><br>&nbsp;&nbsp;${queryParam.res.sql}`;
                break;
            case MessageType.DML:
            case MessageType.DDL:
                queryParam.res.message = `EXECUTE SUCCESS:<br><br>&nbsp;&nbsp;${queryParam.res.sql}<br><br>AffectedRows : ${queryParam.res.affectedRows}`;
                break;
            case MessageType.ERROR:
                queryParam.res.message = `EXECUTE FAIL:<br><br>&nbsp;&nbsp;${queryParam.res.sql}<br><br>Message :<br><br>&nbsp;&nbsp;${queryParam.res.message}`;
                break;
        }
    }
    private static createColumnTypeMap(queryParam: QueryParam<DataResponse>) {
        const columnList = queryParam.res.columnList
        if (!columnList) return;
        let columnTypeMap = {};
        for (const column of columnList) {
            columnTypeMap[column.name] = column
        }
        queryParam.res.columnTypeMap = columnTypeMap;
    }

    private static keepSingle(queryParam: QueryParam<any>) {
        if (typeof queryParam.singlePage == 'undefined') {
            queryParam.singlePage = true;
        }
        if (!queryParam.queryOption) queryParam.queryOption = {}

        if (!QueryPage.activeViewId) {
            QueryPage.activeViewId = queryParam.queryOption.viewId || new Date().getTime() + "";
        }

        if (!queryParam.queryOption.viewId) {
            queryParam.queryOption.viewId = QueryPage.activeViewId
        }
        return queryParam.queryOption.viewId;
    }

    private static isActiveSql(option: QueryOption): boolean {

        const activeDocument = window.activeTextEditor?.document;
        if (!activeDocument || option.split === false) { return false; }

        const extName = extname(activeDocument.fileName)?.toLowerCase()
        const fileName = basename(activeDocument.fileName)?.toLowerCase()
        const languageId = basename(activeDocument.languageId)?.toLowerCase()

        return languageId == 'sql' || languageId == 'es' || extName == '.sql' || extName == '.es' || fileName.match(/mock.json$/) != null;
    }

    private static async handleHtml(html: string, viewPanel: WebviewPanel): Promise<string> {

        const resourceRoot = Global.getConfig("resourceRoot");
        switch (resourceRoot) {
            case "file":
                return html;
            case "internalServer":
            default:
                //  remote can not access.
                if (env.remoteName) {
                    break;
                }
                await ResourceServer.bind();
                return html.replace("../webview/js/query.js", `http://127.0.0.1:${ResourceServer.port}/query.js`)
                    .replace("../webview/js/vendor.js", `http://127.0.0.1:${ResourceServer.port}/vendor.js`);
        }
        return html;
    }

    private static async loadEsColumnList(queryParam: QueryParam<DataResponse>) {
        const indexName = queryParam.res.sql.split(' ')[1].split('/')[1];
        queryParam.res.table = indexName
        // count, continue
        if (queryParam.res.fields.length == 1) {
            queryParam.res.columnList = queryParam.res.fields as any[]
            return;
        }
        queryParam.res.primaryKey = '_id'
        queryParam.res.tableCount = 1

        queryParam.res.columnList = queryParam.res.fields.slice(2) as any[]
    }

    private static async loadMongoColumnList(queryParam: QueryParam<DataResponse>) {
        const parse = queryParam.res.sql.match(/db\('(.+?)'\)\.collection\('(.+?)'\)/);
        queryParam.res.database = parse[1]
        queryParam.res.table = parse[2]
        queryParam.res.primaryKey = '_id'
        queryParam.res.tableCount = 1
        queryParam.res.columnList = queryParam.res.fields as any[]
    }

    private static async loadColumnList(queryParam: QueryParam<DataResponse>) {
        // fix null point on result view
        queryParam.res.columnList = []
        const sqlList = queryParam.res.sql.match(/(?<=\b(from|join)\b\s*)(\S+)/gi)
        if (!sqlList || sqlList.length == 0) {
            return;
        }

        let tableName = sqlList[0]
        let database: string;

        if (queryParam.connection.dbType == DatabaseType.MSSQL && tableName.indexOf(".") != -1) {
            tableName = tableName.split(".")[1]
        }

        // mysql直接从结果集拿
        const fields = queryParam.res.fields
        if (fields && fields[0]?.orgTable) {
            tableName = fields[0].orgTable;
            database = fields[0].schema || fields[0].db;
            queryParam.res.database = database;
        } else {
            tableName = tableName.replace(/^"?(.+?)"?$/, '$1')
        }

        const tableNode = queryParam.connection.getByRegion(tableName)
        if (tableNode) {
            let primaryKey: string;
            let primaryKeyList = [];
            const columnList = (await tableNode.getChildren(true)).map((columnNode: ColumnNode) => {
                if (columnNode.isPrimaryKey) {
                    primaryKey = columnNode.column.name;
                    primaryKeyList.push(columnNode.column)
                }
                return columnNode.column;
            });
            queryParam.res.primaryKey = primaryKey;
            queryParam.res.columnList = columnList;
            queryParam.res.primaryKeyList = primaryKeyList;
            // compatible sqlite empty result.
            if (queryParam.res.fields.length == 0) {
                queryParam.res.fields = columnList as any as FieldInfo[];
            }
        }
        queryParam.res.tableCount = sqlList.length;
        queryParam.res.table = tableName;
    }

}