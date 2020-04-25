"user strict";
import * as vscode from "vscode";

export class Console {
    public static log(value: any) {
        if (this.outputChannel == null) {
            this.outputChannel = vscode.window.createOutputChannel("MySQL");
        }
        this.outputChannel.show(true);
        this.outputChannel.appendLine(value + "");
        this.outputChannel.appendLine("-----------------------------------------------------------------------------------------");
    }

    private static outputChannel: vscode.OutputChannel;
}
