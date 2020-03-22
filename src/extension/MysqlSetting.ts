import * as vscode from "vscode";
import * as fs from "fs";
import process = require('process');


export class MysqlSetting {
    private static x64 = "C:\\Program Files\\MySQL";
    private static x86 = "C:\\Program Files (x86)\\MySQL";
    static open() {
        if(!process.platform.match(/win/ig)){
            vscode.window.showErrorMessage("Only Support Windows OS.")
            return;
        }
        var isOpen = this.check(this.x86)
        if (!isOpen) {
            var isOpen = this.check(this.x64)
            if (!isOpen) {
                vscode.window.showErrorMessage("Cannot find mysql setting in your machine.")
            }
        }
    }

    static check(param): boolean {
        for (const fileName of fs.readdirSync(param)) {
            const serverPath = param + "\\" + fileName;
            if (fs.statSync(serverPath).isDirectory) {
                vscode.workspace.openTextDocument(vscode.Uri.file(`${serverPath}\\my.ini`)).then(doc => {
                    vscode.window.showTextDocument(doc);
                });
                return true;
            }
        }
        return false;
    }


}