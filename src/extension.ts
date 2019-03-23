"use strict";
import * as vscode from "vscode";
import { AppInsightsClient } from "./common/appInsightsClient";
import { Utility } from "./common/utility";
import { ConnectionNode } from "./model/connectionNode";
import { DatabaseNode } from "./model/databaseNode";
import { INode } from "./model/INode";
import { TableNode } from "./model/tableNode";
import { MySQLTreeDataProvider } from "./mysqlTreeDataProvider";
import { SqlResultDocumentContentProvider } from "./sqlResultDocumentContentProvider";
import { CompletionProvider } from "./CompletionProvider";

export function activate(context: vscode.ExtensionContext) {
    AppInsightsClient.sendEvent("loadExtension");

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('sql',new CompletionProvider(),' ','.'))

    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("sqlresult", new SqlResultDocumentContentProvider(context)));

    const mysqlTreeDataProvider = new MySQLTreeDataProvider(context);
    context.subscriptions.push(vscode.window.registerTreeDataProvider("mysql", mysqlTreeDataProvider));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.refresh", (node: INode) => {
        AppInsightsClient.sendEvent("refresh");
        mysqlTreeDataProvider.refresh(node);
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.addConnection", () => {
        mysqlTreeDataProvider.addConnection();
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.deleteConnection", (connectionNode: ConnectionNode) => {
        connectionNode.deleteConnection(context, mysqlTreeDataProvider);
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.runQuery", () => {
        Utility.runQuery();
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.newQuery", (databaseOrConnectionNode: DatabaseNode | ConnectionNode) => {
        databaseOrConnectionNode.newQuery();
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand("mysql.template.sql", (tableNode: TableNode, run: Boolean) => {
        tableNode.selectSqlTemplate(run);

    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.copy.names", (tableNode: TableNode) => {
        tableNode.printNames();
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
