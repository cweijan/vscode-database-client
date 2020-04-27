import * as vscode from "vscode";
import { ExtensionContext } from "vscode";
import { FileManager } from "../common/FileManager";
import { CompletionProvider } from "../provider/Complection/CompletionProvider";
import { SqlFormatProvider } from "../provider/SqlFormatProvider";
import { TableHoverProvider } from "../provider/TableHoverProvider";
import { DbTreeDataProvider as DbTreeDataProvider } from "../provider/treeDataProvider";
import { ViewManager } from "../view/viewManager";
import { AbstractConnectService } from "./connect/abstractConnectService";
import { MysqlConnectService } from "./connect/impl/mysqlConnectService";
import { DatabaseCache } from "./databaseCache";
import { DatabaseType } from "./databaseType";
import { AbstractDumpService } from "./dump/abstractDumpService";
import { MysqlDumpService } from "./dump/mysqlDumpService";
import { HistoryService } from "./HistoryService";
import { MockRunner } from "./mock/mockRunner";
import { MysqlSettingService } from "./setting/MysqlSettingService";
import { SettingService } from "./setting/settingService";

export class ServiceManager {

    public mockRunner: MockRunner;
    public provider: DbTreeDataProvider;
    public historyService: HistoryService;
    public connectService: AbstractConnectService;
    public settingService: SettingService;
    public dumpService: AbstractDumpService;
    private isInit = false;
    private type: DatabaseType = DatabaseType.mysql;

    constructor(private readonly context: ExtensionContext) {
        this.mockRunner = new MockRunner();
        this.historyService = new HistoryService()
        DatabaseCache.initCache(context);
        ViewManager.initExtesnsionPath(context.extensionPath);
        FileManager.init(context)
    }

    public init(): vscode.Disposable[] {
        if (this.isInit) { return [] }
        const res: vscode.Disposable[] = [
            vscode.languages.registerDocumentRangeFormattingEditProvider('sql', new SqlFormatProvider()),
            vscode.languages.registerHoverProvider('sql', new TableHoverProvider()),
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
    }

}