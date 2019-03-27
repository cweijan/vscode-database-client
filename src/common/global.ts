"use strict";
import * as vscode from "vscode";
import { IConnection } from "../model/Connection";

export class Global {
    
    private static mysqlStatusBarItem: vscode.StatusBarItem;

    public static updateStatusBarItems(activeConnection: IConnection) {
        if (Global.mysqlStatusBarItem) {
            Global.mysqlStatusBarItem.text = Global.getStatusBarItemText(activeConnection);
        } else {
            Global.mysqlStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
            Global.mysqlStatusBarItem.text = Global.getStatusBarItemText(activeConnection);
            Global.mysqlStatusBarItem.show();
        }
    }

    private static getStatusBarItemText(activeConnection: IConnection): string {
        return `$(server) ${activeConnection.host}` + (activeConnection.database ? ` $(database) ${activeConnection.database}` : "");
    }
}