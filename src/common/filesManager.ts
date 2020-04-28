import * as path from 'path';
import * as vscode from "vscode";
import * as fs from 'fs';

export class FileManager {

    public static storagePath: string;
    public static init(context: vscode.ExtensionContext) {
        this.storagePath = context.globalStoragePath;
    }

    public static show(fileName: string) {
        if (!this.storagePath) { vscode.window.showErrorMessage("FileManager is not init!") }
        if (!fileName) { return; }
        const recordPath = `${this.storagePath}/${fileName}`;
        this.check(path.resolve(recordPath, '..'))
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
            this.check(path.resolve(recordPath, '..'))
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


    
    private static check(path: string) {

        if (!fs.existsSync(path)) { this.recursiseCreate(path) }

    }


    /**
     * get from StackOverFlow
     * @param folderPath 
     */
    private static recursiseCreate(folderPath: string) {
        folderPath.split(path.sep)
            .reduce((prevPath, folder) => {
                const currentPath = path.join(prevPath, folder, path.sep);
                if (!fs.existsSync(currentPath)) {
                    fs.mkdirSync(currentPath);
                }
                return currentPath;
            }, '');
    }

}

export enum FileModel {
    WRITE, APPEND
}