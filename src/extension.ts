"use strict";
import * as vscode from "vscode";
import { QueryUnit } from "./database/QueryUnit";
import { ConnectionNode } from "./model/ConnectionNode";
import { DatabaseNode } from "./model/DatabaseNode";
import { INode } from "./model/INode";
import { TableNode } from "./model/TableNode";
import { MySQLTreeDataProvider } from "./provider/MysqlTreeDataProvider";
import { CompletionProvider } from "./provider/CompletionProvider";
import { DatabaseCache } from "./database/DatabaseCache";
import { Global } from "./common/Global";
import { ColumnNode } from "./model/ColumnNode";
import { SqlViewManager } from "./database/SqlViewManager";

export function activate(context: vscode.ExtensionContext) {

    DatabaseCache.initCache(context)

    SqlViewManager.initExtesnsionPath(context.extensionPath)

    const sqlFiltertTreeProvider = new MySQLTreeDataProvider(context);
    // vscode.window.registerTreeDataProvider("github.cweijan.mysql.filter", sqlFiltertTreeProvider)
    const sqlTreeProvider = new MySQLTreeDataProvider(context);
    const treeview = vscode.window.createTreeView("github.cweijan.mysql", {
        treeDataProvider: sqlTreeProvider
    })
    treeview.onDidCollapseElement(event => {
        DatabaseCache.storeElementState(event.element, vscode.TreeItemCollapsibleState.Collapsed)
    })
    treeview.onDidExpandElement(event => {
        DatabaseCache.storeElementState(event.element, vscode.TreeItemCollapsibleState.Expanded)
    })

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('sql', new CompletionProvider(), ' ', '.'))

    context.subscriptions.push(vscode.commands.registerCommand("mysql.refresh", (node: INode) => {
        DatabaseCache.evictAllCache()
        sqlTreeProvider.init()
        sqlTreeProvider.refresh()
        DatabaseCache.storeCurrentCache()
    }));


    context.subscriptions.push(vscode.commands.registerCommand("mysql.addDatabase", (connectionNode: ConnectionNode) => {
        connectionNode.createDatabase(sqlTreeProvider)
    }));
    context.subscriptions.push(vscode.commands.registerCommand("mysql.deleteDatabase", (databaseNode: DatabaseNode) => {
        databaseNode.deleteDatatabase(sqlTreeProvider)
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.addConnection", () => {
        SqlViewManager.showConnectPage(sqlTreeProvider)
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.changeTableName", (tableNode: TableNode) => {
        tableNode.changeTableName(sqlTreeProvider)
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.table.truncate", (tableNode: TableNode) => {
        tableNode.truncateTable()
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.table.drop", (tableNode: TableNode) => {
        tableNode.dropTable(sqlTreeProvider)
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.changeColumnName", (columnNode: ColumnNode) => {
        columnNode.changeColumnName(sqlTreeProvider)
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.deleteConnection", (connectionNode: ConnectionNode) => {
        connectionNode.deleteConnection(context, sqlTreeProvider);
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

    context.subscriptions.push(vscode.commands.registerCommand("mysql.data.export", (iNode: TableNode | DatabaseNode) => {
        vscode.window.showOpenDialog({ canSelectMany: false, openLabel: "Select export file path", canSelectFiles: false, canSelectFolders: true }).then(folderPath => {
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
