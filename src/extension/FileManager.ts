import * as fs from "fs";
import * as vscode from "vscode";

export class FileManager {
    private static context: vscode.ExtensionContext;
    public static init(context: vscode.ExtensionContext) {
        this.context = context;
    }
    public static show(fileName: string) {
        if (!this.context) { vscode.window.showErrorMessage("FileManager is not init!") }
        if (!fileName) { return; }
        const recordPath = `${this.context['globalStoragePath']}/${fileName}`;
        if (!fs.existsSync(recordPath)) {
            fs.appendFileSync(recordPath, "");
        }
        const openPath = vscode.Uri.file(recordPath);
        return new Promise((resolve) => {
            vscode.workspace.openTextDocument(openPath).then(async (doc) => {
                resolve(await vscode.window.showTextDocument(doc));
            });
        })

    }

    public static record(fileName: string, content: string) {
        if (!this.context) { vscode.window.showErrorMessage("FileManager is not init!") }
        if (!fileName || !content) { return; }
        return new Promise(() => {
            const recordPath = `${this.context['globalStoragePath']}/${fileName}`;
            if (!fs.existsSync(recordPath)) {
                fs.mkdirSync(recordPath);
            }
            fs.appendFileSync(recordPath, `${content}`, { encoding: 'utf8' });

        });
    }
}