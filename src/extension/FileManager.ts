import * as fs from "fs";
import * as vscode from "vscode";

export class FileManager {
    private static storagePath: string;
    public static init(context: vscode.ExtensionContext) {
        this.storagePath = context.globalStoragePath;
    }

    public static show(fileName: string) {
        if (!this.storagePath) { vscode.window.showErrorMessage("FileManager is not init!") }
        if (!fileName) { return; }
        const recordPath = `${this.storagePath}/${fileName}`;
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

    public static record(fileName: string, content: string, model?: FileModel): Promise<string> {
        if (!this.storagePath) { vscode.window.showErrorMessage("FileManager is not init!") }
        if (!fileName || !content) { return; }
        return new Promise((resolve) => {
            const recordPath = `${this.storagePath}/${fileName}`;
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath);
            }
            if (model == FileModel.WRITE) {
                fs.writeFileSync(recordPath, `${content}`, { encoding: 'utf8' });
            } else {
                fs.appendFileSync(recordPath, `${content}`, { encoding: 'utf8' });
            }
            resolve(recordPath)
        });
    }
}

export enum FileModel {
    WRITE, APPEND
}