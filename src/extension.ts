"use strict";
import * as vscode from "vscode";
import { AppInsightsClient } from "./common/appInsightsClient";
import { Utility } from "./database/utility";
import { ConnectionNode } from "./model/ConnectionNode";
import { DatabaseNode } from "./model/databaseNode";
import { INode } from "./model/INode";
import { TableNode } from "./model/tableNode";
import { MySQLTreeDataProvider } from "./provider/mysqlTreeDataProvider";
import { SqlResultDocumentContentProvider } from "./provider/sqlResultDocumentContentProvider";
import { CompletionProvider } from "./provider/CompletionProvider";
import { DatabaseCache } from "./database/DatabaseCache";
import { Global } from "./common/global";
import { ColumnNode } from "./model/columnNode";
import { OutputChannel } from "./common/outputChannel";
import { SqlViewManager } from "./database/SqlViewManager";

export function activate(context: vscode.ExtensionContext) {

    AppInsightsClient.sendEvent("loadExtension");

    DatabaseCache.initCache(context)

    SqlViewManager.initExtesnsionPath(context.extensionPath)
    
    const mysqlTreeDataProvider = new MySQLTreeDataProvider(context);
    const treeview= vscode.window.createTreeView("mysql",{
        treeDataProvider:mysqlTreeDataProvider
    })
    Global.sqlTreeProvider=mysqlTreeDataProvider
    treeview.onDidCollapseElement(event=>{
        DatabaseCache.storeElementState(event.element,vscode.TreeItemCollapsibleState.Collapsed)
    })
    treeview.onDidExpandElement(event=>{
        DatabaseCache.storeElementState(event.element,vscode.TreeItemCollapsibleState.Expanded)
    })

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('sql',new CompletionProvider(),' ','.'))

    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("sqlresult", new SqlResultDocumentContentProvider(context)));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.refresh", (node: INode) => {
        DatabaseCache.evictAllCache()
        mysqlTreeDataProvider.init()
        mysqlTreeDataProvider.refresh()
    }));


    context.subscriptions.push(vscode.commands.registerCommand("mysql.addConnection", () => {
        mysqlTreeDataProvider.addConnection();
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.changeTableName", (tableNode: TableNode) => {
        tableNode.changeTableName()
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.table.truncate", (tableNode: TableNode) => {
        tableNode.truncateTable()
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.table.drop", (tableNode: TableNode) => {
        tableNode.dropTable()
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.changeColumnName", (columnNode: ColumnNode) => {
        columnNode.changeColumnName()
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.deleteConnection", (connectionNode: ConnectionNode) => {
        connectionNode.deleteConnection(context, mysqlTreeDataProvider);
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.runQuery", () => {
        Utility.runQuery();
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.newQuery", (databaseOrConnectionNode: DatabaseNode | ConnectionNode) => {
        databaseOrConnectionNode.newQuery();
        Utility.webviewPanel.webview.postMessage({command:'mysql.newQuery'})
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand("mysql.template.sql", (tableNode: TableNode, run: Boolean) => {
        tableNode.selectSqlTemplate(run);

    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.data.export", (iNode: TableNode|DatabaseNode) => {
        vscode.window.showOpenDialog({canSelectMany:false,openLabel:"Select export file path",canSelectFiles:false,canSelectFolders:true}).then(folderPath=>{
            iNode.backupData(folderPath[0].fsPath)
        })
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.template.delete", (tableNode: TableNode) => {
        tableNode.deleteSqlTemplate();
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.copy.insert", (tableNode: TableNode) => {
        tableNode.insertSqlTemplate();
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.copy.update", (tableNode: TableNode) => {
        tableNode.updateSqlTemplate();
    }));

}

export function deactivate() {
}
