import * as vscode from "vscode";
import { ExtensionContext } from "vscode";
import { FileManager } from "../common/filesManager";
import { CompletionProvider } from "../provider/Complection/completionProvider";
import { SqlFormattingProvider } from "../provider/sqlFormattingProvider";
import { TableInfoHoverProvider } from "../provider/tableInfoHoverProvider";
import { DbTreeDataProvider as DbTreeDataProvider } from "../provider/treeDataProvider";
import { ViewManager } from "../view/viewManager";
import { AbstractConnectService } from "./connect/abstractConnectService";
import { MysqlConnectService } from "./connect/impl/mysqlConnectService";
import { DatabaseCache } from "./common/databaseCache";
import { DatabaseType } from "./common/databaseType";
import { AbstractDumpService } from "./dump/abstractDumpService";
import { MysqlDumpService } from "./dump/mysqlDumpService";
import { MockRunner } from "./mock/mockRunner";
import { MysqlSettingService } from "./setting/MysqlSettingService";
import { SettingService } from "./setting/settingService";
import { HistoryRecorder } from "./common/historyRecorder";
import { StatusService } from "../view/status/statusService";
import { MysqlStatusService } from "../view/status/impl/mysqlStatusService";

export class ServiceManager {

    public mockRunner: MockRunner;
    public provider: DbTreeDataProvider;
    public historyService: HistoryRecorder;
    public connectService: AbstractConnectService;
    public settingService: SettingService;
    public statusService: StatusService;
    public dumpService: AbstractDumpService;
    private isInit = false;
    private type: DatabaseType = DatabaseType.mysql;

    constructor(private readonly context: ExtensionContext) {
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

        switch (this.type) {
            case DatabaseType.mysql:
                this.initMysqlService();
                break;
        }

        res.push(this.initTreeView())
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
        this.dumpService = new MysqlDumpService();
        this.connectService = new MysqlConnectService();
        this.statusService = new MysqlStatusService()
    }

}