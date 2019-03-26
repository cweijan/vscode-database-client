"use strict";
import * as vscode from "vscode";
import { AppInsightsClient } from "./common/appInsightsClient";
import { QueryUnit } from "./database/QueryUnit";
import { ConnectionNode } from "./model/ConnectionNode";
import { DatabaseNode } from "./model/databaseNode";
import { INode } from "./model/INode";
import { TableNode } from "./model/tableNode";
import { MySQLTreeDataProvider } from "./provider/mysqlTreeDataProvider";
import { SqlResultDocumentContentProvider } from "./provider/sqlResultDocumentContentProvider";
import { CompletionProvider } from "./provider/CompletionProvider";
import { DatabaseCache } from "./database/DatabaseCache";
import { Global } from "./common/Global";
import { ColumnNode } from "./model/columnNode";
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


    context.subscriptions.push(vscode.commands.registerCommand("mysql.addDatabase", (connectionNode: ConnectionNode) => {
        connectionNode.createDatabase()
    }));
    context.subscriptions.push(vscode.commands.registerCommand("mysql.deleteDatabase", (databaseNode: DatabaseNode) => {
        databaseNode.deleteDatatabase()
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.addConnection", () => {
        SqlViewManager.showConnectPage(mysqlTreeDataProvider)
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
        QueryUnit.runQuery();
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.newQuery", (databaseOrConnectionNode: DatabaseNode | ConnectionNode) => {
        databaseOrConnectionNode.newQuery();
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
