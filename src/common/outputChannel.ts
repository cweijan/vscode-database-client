"user strict";
import * as vscode from "vscode";

export class OutputChannel {
    public static appendLine(value: string) {
        OutputChannel.outputChannel.show(true);
        OutputChannel.outputChannel.appendLine(value);
    }

    private static outputChannel = vscode.window.createOutputChannel("MySQL");
}
