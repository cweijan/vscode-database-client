"use strict";
import * as keytarType from "keytar";
import * as vscode from "vscode";
import { IConnection } from "../model/connection";

export class Global {
    public static keytar: typeof keytarType = getCoreNodeModule(`keytar`);

    static get activeConnection(): IConnection {
        return Global._activeConnection;
    }

    static set activeConnection(newActiveConnection: IConnection) {
        this._activeConnection = newActiveConnection;
        Global.updateStatusBarItems(newActiveConnection);
    }

    public static updateStatusBarItems(activeConnection: IConnection) {
        if (Global.mysqlStatusBarItem) {
            Global.mysqlStatusBarItem.text = Global.getStatusBarItemText(activeConnection);
        } else {
            Global.mysqlStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
            Global.mysqlStatusBarItem.text = Global.getStatusBarItemText(activeConnection);
            Global.mysqlStatusBarItem.show();
        }
    }

    private static _activeConnection: IConnection;
    private static mysqlStatusBarItem: vscode.StatusBarItem;

    private static getStatusBarItemText(activeConnection: IConnection): string {
        return `$(server) ${activeConnection.host}` + (activeConnection.database ? ` $(database) ${activeConnection.database}` : "");
    }
}

/**
 * Returns a node module installed with VSCode, or null if it fails.
 */
function getCoreNodeModule(moduleName: string) {
    try {
        return require(`${vscode.env.appRoot}/node_modules.asar/${moduleName}`);
    } catch (err) { }

    try {
        return require(`${vscode.env.appRoot}/node_modules/${moduleName}`);
    } catch (err) { }

    return null;
}
