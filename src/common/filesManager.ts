import * as path from 'path';
import * as vscode from "vscode";
import * as fs from 'fs';
import { Node } from '@/model/interface/node';

export class FileManager {

    public static storagePath: string;
    public static init(context: vscode.ExtensionContext) {
        this.storagePath = context.globalStoragePath;
    }

    public static async showSQLTextDocument(node: Node, sql: string, template = "template.sql", fileMode?: FileModel): Promise<vscode.TextEditor> {

        const uid = node.uid.includes("#") ? node.uid.replace(/#.*/,'') : node.uid;
        const document = await vscode.workspace.openTextDocument(await FileManager.record(`${uid}/${template}`, sql, fileMode));
        return await vscode.window.showTextDocument(document);
    }

    public static show(fileName: string): Promise<vscode.TextEditor> {
        if (!this.storagePath) { vscode.window.showErrorMessage("FileManager is not init!") }
        if (!fileName) { return; }
        const recordPath = path.isAbsolute(fileName) ? fileName : `${this.storagePath}/${fileName}`;
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
        if (!fileName) { return; }
        fileName = fileName.replace(/[\:\*\?"\<\>]*/g, "")
        return new Promise((resolve) => {
            const recordPath = `${this.storagePath}/${fileName}`;
            this.check(path.resolve(recordPath, '..'))
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath, { recursive: true });
            }
            switch (model) {
                case FileModel.WRITE:
                    fs.writeFileSync(recordPath, `${content}`, { encoding: 'utf8' });
                    break;
                case FileModel.APPEND:
                    if (fs.existsSync(recordPath) && fs.statSync(recordPath).size > 0) {
                        content = `\n\n${content}`;
                    }
                    fs.appendFileSync(recordPath, content, { encoding: 'utf8' });
                    break;
                default:
                    if(!fs.existsSync(recordPath)){
                        fs.writeFileSync(recordPath, ``, { encoding: 'utf8' });
                    }
                    break;
            }
            resolve(recordPath)
        });
    }

    public static getPath(fileName: string) {
        return `${this.storagePath}/${fileName}`;
    }


    private static check(checkPath: string) {
        if (!fs.existsSync(checkPath)) { this.recursiseCreate(checkPath) }

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
                    fs.mkdirSync(currentPath, { recursive: true });
                }
                return currentPath;
            }, '');
    }

}

export enum FileModel {
    WRITE, APPEND
}