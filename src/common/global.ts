"use strict";
import * as keytarType from "keytar";
import * as vscode from "vscode";
import { IConnection } from "../model/connection";

export class Global {
    public static keytar: typeof keytarType = require(`${vscode.env.appRoot}/node_modules/keytar`);

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
