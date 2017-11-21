"use strict";
import * as vscode from "vscode";
import { IConnection } from "../model/connection";

export class Global {
    public static activeConnection: IConnection;
}
