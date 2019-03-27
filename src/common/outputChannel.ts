"user strict";
import * as vscode from "vscode";

export class Console {
    public static log(value: Object) {
        Console.outputChannel.show(true);
        Console.outputChannel.appendLine(value+"");
    }

    private static outputChannel = vscode.window.createOutputChannel("MySQL");
}
