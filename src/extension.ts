"use strict";
// Don't change import order, it will occur circular reference
import * as vscode from "vscode";
import { QueryUnit } from "./database/QueryUnit";
import { ConnectionNode } from "./model/database/connectionNode";
import { DatabaseNode } from "./model/database/databaseNode";
import { TableNode } from "./model/main/tableNode";
import { MySQLTreeDataProvider } from "./provider/MysqlTreeDataProvider";
import { CompletionProvider } from "./provider/Complection/CompletionProvider";
import { DatabaseCache } from "./database/DatabaseCache";
import { ColumnNode } from "./model/other/columnNode";
import { SqlViewManager } from "./view/SqlViewManager";
import { ProcedureNode } from "./model/main/procedure";
import { FunctionNode } from "./model/main/function";
import { TriggerNode } from "./model/main/trigger";
import { UserNode, UserGroup } from "./model/database/userGroup";
import { FunctionGroup } from "./model/main/functionGroup";
import { TriggerGroup } from "./model/main/triggerGroup";
import { ProcedureGroup } from "./model/main/procedureGroup";
import { ViewGroup } from "./model/main/viewGroup";
import { ViewNode } from "./model/main/viewNode";
import { SqlFormatProvider } from "./provider/SqlFormatProvider";
import { HistoryManager } from "./extension/HistoryManager";
import { CommandKey } from "./common/Constants";
import { TableHoverProvider } from "./provider/TableHoverProvider";
import { TableGroup } from "./model/main/tableGroup";
import { MysqlSetting } from "./extension/MysqlSetting";
import { CopyAble } from "./model/interface/copyAble";
import { ServiceManager } from "./extension/serviceManager";

export function activate(context: vscode.ExtensionContext) {

    const serviceManager = new ServiceManager(context)

    const mysqlTreeDataProvider = new MySQLTreeDataProvider(context);
    const treeview = vscode.window.createTreeView("github.cweijan.mysql", {
        treeDataProvider: mysqlTreeDataProvider,
    });
    treeview.onDidCollapseElement((event) => {
        DatabaseCache.storeElementState(event.element, vscode.TreeItemCollapsibleState.Collapsed);
    });
    treeview.onDidExpandElement((event) => {
        DatabaseCache.storeElementState(event.element, vscode.TreeItemCollapsibleState.Expanded);
    });

    context.subscriptions.push(
        vscode.languages.registerDocumentRangeFormattingEditProvider('sql', new SqlFormatProvider()),
        vscode.languages.registerHoverProvider('sql', new TableHoverProvider()),
        vscode.languages.registerCompletionItemProvider('sql', new CompletionProvider(), ' ', '.', ">", "<", "=", "("),
        ...initCommand({
            "mysql.history.open": () => HistoryManager.showHistory(),
            [CommandKey.Refresh]: () => { mysqlTreeDataProvider.init(); },
            [CommandKey.RecordHistory]: (sql: string, costTime: number) => {
                HistoryManager.recordHistory(sql, costTime);
            },
            "mysql.addDatabase": (connectionNode: ConnectionNode) => {
                connectionNode.createDatabase();
            },
            "mysql.deleteDatabase": (databaseNode: DatabaseNode) => {
                databaseNode.dropDatatabase();
            },
            "mysql.addConnection": () => {
                SqlViewManager.showConnectPage();
            },
            "mysql.changeTableName": (tableNode: TableNode) => {
                tableNode.changeTableName();
            },
            "mysql.index.template": (tableNode: TableNode) => {
                tableNode.indexTemplate();
            },
            "mysql.db.active": () => {
                mysqlTreeDataProvider.activeDb();
            },
            "mysql.table.truncate": (tableNode: TableNode) => {
                tableNode.truncateTable();
            },
            "mysql.table.drop": (tableNode: TableNode) => {
                tableNode.dropTable();
            },
            "mysql.mock.table": (tableNode: TableNode) => {
                serviceManager.mockRunner.create(tableNode)
            },
            "mysql.mock.run": () => {
                serviceManager.mockRunner.runMock()
            },
            "mysql.table.source": (tableNode: TableNode) => {
                if (tableNode) { tableNode.showSource(); }
            },
            "mysql.changeColumnName": (columnNode: ColumnNode) => {
                columnNode.changeColumnName();
            },
            "mysql.column.add": (tableNode: TableNode) => {
                tableNode.addColumnTemplate();
            },
            "mysql.column.update": (columnNode: ColumnNode) => {
                columnNode.updateColumnTemplate();
            },
            "mysql.column.drop": (columnNode: ColumnNode) => {
                columnNode.dropColumnTemplate();
            },
            "mysql.deleteConnection": (connectionNode: ConnectionNode) => {
                connectionNode.deleteConnection(context);
            },
            "mysql.runQuery": (sql) => {
                if (typeof sql != 'string') { sql = null; }
                QueryUnit.runQuery(sql);
            },
            "mysql.newQuery": (databaseOrConnectionNode: DatabaseNode | ConnectionNode) => {
                if (databaseOrConnectionNode) {
                    databaseOrConnectionNode.newQuery();
                } else {
                    ConnectionNode.tryOpenQuery();
                }
            },
            "mysql.template.sql": (tableNode: TableNode, run: boolean) => {
                tableNode.selectSqlTemplate(run);
            },
            "mysql.name.copy": (copyAble: CopyAble) => {
                copyAble.copyName();
            },
            "mysql.data.import": (iNode: DatabaseNode | ConnectionNode) => {
                vscode.window.showOpenDialog({ filters: { Sql: ['sql'] }, canSelectMany: false, openLabel: "Select sql file to import", canSelectFiles: true, canSelectFolders: false }).then((filePath) => {
                    iNode.importData(filePath[0].fsPath);
                });
            },
            "mysql.data.export": (iNode: TableNode | DatabaseNode) => {
                vscode.window.showOpenDialog({ canSelectMany: false, openLabel: "Select export file path", canSelectFiles: false, canSelectFolders: true }).then((folderPath) => {
                    iNode.backupData(folderPath[0].fsPath);
                });
            },
            "mysql.template.delete": (tableNode: TableNode) => {
                tableNode.deleteSqlTemplate();
            },
            "mysql.copy.insert": (tableNode: TableNode) => {
                tableNode.insertSqlTemplate();
            },
            "mysql.copy.update": (tableNode: TableNode) => {
                tableNode.updateSqlTemplate();
            },
            "mysql.show.procedure": (procedureNode: ProcedureNode) => {
                procedureNode.showSource();
            },
            "mysql.show.function": (functionNode: FunctionNode) => {
                functionNode.showSource();
            },
            "mysql.show.trigger": (triggerNode: TriggerNode) => {
                triggerNode.showSource();
            },
            "mysql.user.sql": (userNode: UserNode) => {
                userNode.selectSqlTemplate();
            },
            "mysql.template.table": (tableGroup: TableGroup) => {
                tableGroup.createTemplate();
            },
            "mysql.template.procedure": (procedureGroup: ProcedureGroup) => {
                procedureGroup.createTemplate();
            },
            "mysql.setting.open": (procedureGroup: ProcedureGroup) => {
                MysqlSetting.open();
            },
            "mysql.template.view": (viewGroup: ViewGroup) => {
                viewGroup.createTemplate();
            },
            "mysql.template.trigger": (triggerGroup: TriggerGroup) => {
                triggerGroup.createTemplate();
            },
            "mysql.template.function": (functionGroup: FunctionGroup) => {
                functionGroup.createTemplate();
            },
            "mysql.template.user": (userGroup: UserGroup) => {
                userGroup.createTemplate();
            },
            "mysql.delete.user": (userNode: UserNode) => {
                userNode.drop();
            },
            "mysql.delete.view": (viewNode: ViewNode) => {
                viewNode.drop();
            },
            "mysql.delete.procedure": (procedureNode: ProcedureNode) => {
                procedureNode.drop();
            },
            "mysql.delete.function": (functionNode: FunctionNode) => {
                functionNode.drop();
            },
            "mysql.delete.trigger": (triggerNode: TriggerNode) => {
                triggerNode.drop();
            },
            "mysql.change.user": (userNode: UserNode) => {
                userNode.changePasswordTemplate();
            },
            "mysql.grant.user": (userNode: UserNode) => {
                userNode.grandTemplate();
            },
        }),

    );

}

export function deactivate() {
}

function initCommand(commandDefinition: any): vscode.Disposable[] {

    const dispose = []

    for (const command in commandDefinition) {
        if (commandDefinition.hasOwnProperty(command)) {
            dispose.push(vscode.commands.registerCommand(command, commandDefinition[command]))
        }
    }

    return dispose;
}

// refrences
// - when : https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts