import { SSHConfig } from '@/model/interface/sshConfig';
import * as vscode from 'vscode';
import { TerminalService } from "./terminalService";

export class ClassicTerminal implements TerminalService {
    openPath(name:string,sshConfig: SSHConfig,fullPath: string): void {
        if (!vscode.window.activeTerminal) {
            vscode.window.showErrorMessage("You must open terminal.")
        } else {
            vscode.window.activeTerminal.sendText(`cd ${fullPath}`)
        }
    }

    openMethod(name:string,sshConfig: SSHConfig): void {

        const title = name || `${sshConfig.username}@${sshConfig.host}`;
        const sendConfirm = "SEND PASSWORD";
        const sshterm = vscode.window.activeTerminal ? vscode.window.activeTerminal : vscode.window.createTerminal(title);
        sshterm.sendText(`ssh ${sshConfig.username}@${sshConfig.host} -o StrictHostKeyChecking=no ${sshConfig.privateKeyPath ? ` -i ${sshConfig.privateKeyPath}` : ''} `);
        sshterm.show();
        const auth = sshConfig.password || sshConfig.passphrase;
        if (auth) {
            vscode.window.showQuickPick([sendConfirm], { ignoreFocusOut: true }).then(res => {
                if (res == sendConfirm) {
                    sshterm.sendText(sshConfig.password)
                }
            })
        }

    }

}