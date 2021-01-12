import * as vscode from "vscode";
import { ExtensionContext } from "vscode";
import { FileManager } from "../common/filesManager";
import { CompletionProvider } from "../provider/complete/completionProvider";
import { SqlFormattingProvider } from "../provider/sqlFormattingProvider";
import { TableInfoHoverProvider } from "../provider/tableInfoHoverProvider";
import { DbTreeDataProvider as DbTreeDataProvider } from "../provider/treeDataProvider";
import { ViewManager } from "../view/viewManager";
import { AbstractConnectService } from "../view/connect/abstractConnectService";
import { MysqlConnectService } from "../view/connect/mysqlConnectService";
import { DatabaseCache } from "./common/databaseCache";
import { AbstractDumpService } from "./dump/abstractDumpService";
import { MysqlDumpService } from "./dump/mysqlDumpService";
import { MockRunner } from "./mock/mockRunner";
import { MysqlSettingService } from "./setting/MysqlSettingService";
import { SettingService } from "./setting/settingService";
import { HistoryRecorder } from "./common/historyRecorder";
import { StatusService } from "../view/status/statusService";
import { MysqlStatusService } from "../view/status/mysqlStatusService";
import { Global } from "../common/global";
import { ImportService } from "./import/importService";
import { MysqlImportService } from "./import/mysqlImportService";
import { OverviewService } from "../view/overview/overviewService";
import { MssqlPageService } from "./page/mssqlPageService";
import { MysqlPageSerivce } from "./page/mysqlPageSerivce";
import { PageService } from "./page/pageService";
import { DatabaseType } from "@/common/constants";
import { PostgreSqlPageService } from "./page/postgreSqlPageService";
import { MssqlDIalect } from "./dialect/mssqlDIalect";
import { MysqlDialect } from "./dialect/mysqlDialect";
import { PostgreSqlDialect } from "./dialect/postgreSqlDialect";
import { SqlDialect } from "./dialect/sqlDialect";
import { PostgresqlImortService } from "./import/postgresqlImortService";
import { SqlServerImportService } from "./import/sqlServerImportService";

export class ServiceManager {

    public static instance: ServiceManager;
    public mockRunner: MockRunner;
    public provider: DbTreeDataProvider;
    public historyService: HistoryRecorder;
    public connectService: AbstractConnectService;
    public settingService: SettingService;
    public overviewService: OverviewService;
    public statusService: StatusService;
    public dumpService: AbstractDumpService;
    private isInit = false;

    constructor(private readonly context: ExtensionContext) {
        Global.context = context;
        this.mockRunner = new MockRunner();
        this.historyService = new HistoryRecorder()
        DatabaseCache.initCache(context);
        ViewManager.initExtesnsionPath(context.extensionPath);
        FileManager.init(context)
    }

    public init(): vscode.Disposable[] {
        if (this.isInit) { return [] }
        const res: vscode.Disposable[] = [
            vscode.languages.registerDocumentRangeFormattingEditProvider('sql', new SqlFormattingProvider()),
            vscode.languages.registerHoverProvider('sql', new TableInfoHoverProvider()),
            vscode.languages.registerCompletionItemProvider('sql', new CompletionProvider(), ' ', '.', ">", "<", "=", "(")
        ]

        this.initMysqlService();
        res.push(this.initTreeView())
        ServiceManager.instance = this;
        this.isInit = true
        return res
    }


    private initTreeView() {
        this.provider = new DbTreeDataProvider(this.context);
        const treeview = vscode.window.createTreeView("github.cweijan.mysql", {
            treeDataProvider: this.provider,
        });
        treeview.onDidCollapseElement((event) => {
            DatabaseCache.storeElementState(event.element, vscode.TreeItemCollapsibleState.Collapsed);
        });
        treeview.onDidExpandElement((event) => {
            DatabaseCache.storeElementState(event.element, vscode.TreeItemCollapsibleState.Expanded);
        });
        return treeview;
    }

    private initMysqlService() {
        this.settingService = new MysqlSettingService();
        this.overviewService = new OverviewService();
        this.dumpService = new MysqlDumpService();
        this.connectService = new MysqlConnectService();
        this.statusService = new MysqlStatusService()
    }

    public static getImportService(dbType:DatabaseType){
        switch (dbType) {
            case DatabaseType.MSSQL:
                return new SqlServerImportService()
            case DatabaseType.PG:
                return new PostgresqlImortService();
        }
        return new MysqlImportService()
    }

    public static getDialect(dbType: DatabaseType): SqlDialect {
        switch (dbType) {
            case DatabaseType.MSSQL:
                return new MssqlDIalect()
            case DatabaseType.PG:
                return new PostgreSqlDialect();
        }
        return new MysqlDialect()
    }

    public static getPageService(databaseType: DatabaseType): PageService {

        switch (databaseType) {
            case DatabaseType.MSSQL:
                return new MssqlPageService();
            case DatabaseType.PG:
                return new PostgreSqlPageService();
        }

        return new MysqlPageSerivce();
    }

}