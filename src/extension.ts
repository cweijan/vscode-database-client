"use strict";
import * as vscode from "vscode";
import { Utility } from "./common/utility";
import { TableNode } from "./model/tableNode";
import { MySQLTreeDataProvider } from "./mysqlTreeDataProvider";

export function activate(context: vscode.ExtensionContext) {
    const mysqlTreeDataProvider = new MySQLTreeDataProvider(context);
    context.subscriptions.push(vscode.window.registerTreeDataProvider("mysql", mysqlTreeDataProvider));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.add", () => {
        mysqlTreeDataProvider.addConnection();
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.runQuery", () => {
        Utility.runQuery();
    }));

    context.subscriptions.push(vscode.commands.registerCommand("mysql.selectTop1000", (tableNode: TableNode) => {
        tableNode.selectTop1000();
    }));
}

export function deactivate() {
}
