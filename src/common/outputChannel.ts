"user strict";
import * as vscode from "vscode";
import format = require('date-format');

export class Console {
    public static log(value: any) {
        if (this.outputChannel == null) {
            this.outputChannel = vscode.window.createOutputChannel("MySQL");
        }
        this.outputChannel.show(true);
        const begin = format('yyyy-MM-dd hh:mm:ss', new Date());
        this.outputChannel.appendLine(`${begin} : ${value}`);
        this.outputChannel.appendLine("-----------------------------------------------------------------------------------------");
    }

    private static outputChannel: vscode.OutputChannel;
}
