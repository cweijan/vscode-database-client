import { Client } from "ssh2";
import * as vscode from 'vscode';
import { TerminalService } from "./terminalService";
import { FileManager, FileModel } from "@/common/filesManager";
import { Util } from "@/common/util";
import { Hanlder, ViewManager } from "@/common/viewManager";
import { SSHConfig } from "@/model/interface/sshConfig";
import { readFileSync } from "fs";

interface Holder {
    handler?: Hanlder,
    randomUrl: string,
    sshUrl: string,
};

export class XtermTerminal implements TerminalService {

    private getSshUrl(sshConfig: SSHConfig): string {
        return 'ssh://' + sshConfig.username + '@' + sshConfig.host + ':' + sshConfig.port;
    }

    private static handlerMap: { [key: string]: Array<Holder> } = {}

    public async openPath(name: string, sshConfig: SSHConfig, fullPath: string) {
        const holders=XtermTerminal.handlerMap[this.getSshUrl(sshConfig)];
        if (holders && holders.length>0) {
            const handler=holders[0].handler
            handler.panel.reveal()
            handler.emit('path', fullPath)
        } else {
            this.openMethod(name, sshConfig, () => { this.openPath(name, sshConfig, fullPath) })
        }
    }

    public async openMethod(name: string, sshConfig: SSHConfig, callback?: () => void) {

        const title = name || `${sshConfig.username}@${sshConfig.host}`;
        const sshUrl = this.getSshUrl(sshConfig)
        const randomUrl = `${sshUrl}_${new Date().getTime()}`;
        const holder: Holder = { sshUrl, randomUrl };
        if (!XtermTerminal.handlerMap[sshUrl]) XtermTerminal.handlerMap[sshUrl] = []
        XtermTerminal.handlerMap[sshUrl].push(holder)

        ViewManager.createWebviewPanel({
            splitView: false, path: "app", iconPath: {
                light: Util.getExtPath("image", "terminal_light.png"),
                dark: Util.getExtPath("image", "terminal_dark.svg"),
            },
            title, type: randomUrl,
            eventHandler: (handler) => {
                this.handlerEvent(holder, handler, sshConfig, callback)
            }
        })

    }

    private removeHolder(holder: Holder) {
        const holders = XtermTerminal.handlerMap[holder.sshUrl];
        if (!holders || holders.length == 0) return;
        for (let i = 0; i < holders.length; i++) {
            const h = holders[i];
            if (h.randomUrl == holder.randomUrl) {
                holders.splice(i, 1);
                break;
            }
        }
    }

    private handlerEvent(holder: Holder, handler: Hanlder, sshConfig: SSHConfig, callback?: () => void) {

        const fontSize = vscode.workspace.getConfiguration("terminal.integrated").get("fontSize", 16)
        const fontFamily = vscode.workspace.getConfiguration("editor").get("fontFamily")

        let dataBuffer = [];
        handler.on("init", () => {
            handler.emit("route", 'sshTerminal')
        }).on("route-sshTerminal", () => {
            handler.emit("terminalConfig", { fontSize, fontFamily })
        }).on("initTerminal", (content) => {
            handler.emit('connecting', `connecting ${sshConfig.username}@${sshConfig.host}...\n`);
            let termCols: number, termRows: number;
            if (content) {
                termCols = content.cols;
                termRows = content.rows
            }
            const client = new Client()
            const end = () => { client.end(); this.removeHolder(holder) }
            const SSHerror = (message: string, err: any) => { handler.emit('ssherror', (err) ? `${message}: ${err.message}` : message); end(); }
            client.on('ready', () => {
                holder.handler = handler;
                client.shell({ term: 'xterm-color', cols: termCols, rows: termRows }, (err, stream) => {
                    if (err) {
                        SSHerror('EXEC ERROR' + err, null)
                        return
                    }
                    handler.emit('header', '')
                    handler.emit('status', 'SSH CONNECTION ESTABLISHED')
                    handler.on('data', (data: string) => {
                        stream.write(data)
                    }).on('resize', (data) => {
                        stream.setWindow(data.rows, data.cols, data.height, data.width)
                    }).on('openLink', uri => {
                        vscode.env.openExternal(vscode.Uri.parse(uri));
                    }).on('dispose', () => {
                        end()
                    })
                    stream.on('data', (data) => {
                        handler.emit('data', data.toString('utf-8'));
                        dataBuffer = dataBuffer.concat(data)
                    })
                    stream.on('close', (code, signal) => {
                        handler.emit('ssherror', 'ssh serssion is close.')
                        end()
                    })
                    if (callback && (typeof callback) == "function")
                        callback()
                })
            })
            // client.on('banner', (data: string) => handler.emit('data', data.replace(/\r?\n/g, '\r\n')))
            client.on('end', (err) => { SSHerror('CONN END BY HOST', err) })
            client.on('close', (err) => { SSHerror('CONN CLOSE', err) })
            client.on('error', (err) => { SSHerror('CONN ERROR', err) })
            client.on('keyboard-interactive', () => {
                end();
            })
            if(sshConfig.type=="privateKey"){
                delete sshConfig.password
                if (sshConfig.privateKeyPath) {
                    sshConfig.privateKey = readFileSync(sshConfig.privateKeyPath)
                }
            }
            
            client.connect(sshConfig)
        }).on('openLog', async () => {
            const filePath = sshConfig.username + '@' + sshConfig.host
            await FileManager.record(filePath, dataBuffer.toString().replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ''), FileModel.WRITE)
            FileManager.show(filePath).then((textEditor: vscode.TextEditor) => {
                const lineCount = textEditor.document.lineCount;
                const range = textEditor.document.lineAt(lineCount - 1).range;
                textEditor.selection = new vscode.Selection(range.end, range.end);
                textEditor.revealRange(range);
            })
        }).on("dispose",()=>{
            this.removeHolder(holder)
        })

    }

}