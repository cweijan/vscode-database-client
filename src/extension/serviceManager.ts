import * as vscode from "vscode";
import { MockRunner } from "./mock/mockRunner";
import { ExtensionContext } from "vscode";
import { SqlViewManager } from "../view/SqlViewManager";
import { DatabaseCache } from "../database/DatabaseCache";
import { FileManager } from "../common/FileManager";
import { SqlFormatProvider } from "../provider/SqlFormatProvider";
import { TableHoverProvider } from "../provider/TableHoverProvider";
import { CompletionProvider } from "../provider/Complection/CompletionProvider";
import { MySQLTreeDataProvider } from "../provider/mysqlTreeDataProvider";
import { HistoryService } from "./HistoryService";
import { MysqlSettingService } from "./setting/MysqlSettingService";
import { SettingInterface } from "./setting/SettingInterface";

export class ServiceManager {

    public mockRunner: MockRunner;
    public historyService: HistoryService;
    public provider: MySQLTreeDataProvider;
    public settingService: SettingInterface;
    private isInit = false;

    constructor(private readonly context: ExtensionContext) {
        this.mockRunner = new MockRunner();
        DatabaseCache.initCache(context);
        SqlViewManager.initExtesnsionPath(context.extensionPath);
        FileManager.init(context)
    }

    public init(): vscode.Disposable[] {
        if (this.isInit) { return [] }
        const res: vscode.Disposable[] = [
            vscode.languages.registerDocumentRangeFormattingEditProvider('sql', new SqlFormatProvider()),
            vscode.languages.registerHoverProvider('sql', new TableHoverProvider()),
            vscode.languages.registerCompletionItemProvider('sql', new CompletionProvider(), ' ', '.', ">", "<", "=", "(")
        ]

        this.historyService = new HistoryService()
        this.settingService = new MysqlSettingService()

        this.provider = new MySQLTreeDataProvider(this.context);
        const treeview = vscode.window.createTreeView("github.cweijan.mysql", {
            treeDataProvider: this.provider,
        });
        treeview.onDidCollapseElement((event) => {
            DatabaseCache.storeElementState(event.element, vscode.TreeItemCollapsibleState.Collapsed);
        });
        treeview.onDidExpandElement((event) => {
            DatabaseCache.storeElementState(event.element, vscode.TreeItemCollapsibleState.Expanded);
        });

        res.push(treeview)
        this.isInit = true
        return res
    }

}