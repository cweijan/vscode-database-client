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

export function activate(context: vscode.ExtensionContext) {
    AppInsightsClient.sendEvent("loadExtension");

    const provider = new SqlResultDocumentContentProvider(context);
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("sqlresult", provider));

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

    context.subscriptions.push(vscode.commands.registerCommand("mysql.selectTop1000", (tableNode: TableNode) => {
        tableNode.selectTop1000();
    }));
}

export function deactivate() {
}
