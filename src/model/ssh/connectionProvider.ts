import { CommandKey } from '@/common/constants';
import { ClientManager } from '@/service/ssh/clientManager';
import { existsSync } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Event, EventEmitter, ExtensionContext } from "vscode";
import { Node } from '../interface/node';
import { SSHConfig } from '../interface/sshConfig';
import { InfoNode } from '../other/infoNode';
import { SSHConnectionNode } from './sshConnectionNode';


export default class ConnectionProvider  {
    _onDidChangeTreeData: EventEmitter<Node> = new EventEmitter<Node>();
    readonly onDidChangeTreeData: Event<Node> = this._onDidChangeTreeData.event;
    public static tempRemoteMap = new Map<string, { remote: string, sshConfig: SSHConfig }>()

    constructor(private context: ExtensionContext) {
        vscode.workspace.onDidSaveTextDocument(e => {
            const tempPath = path.resolve(e.fileName);
            const data = ConnectionProvider.tempRemoteMap.get(tempPath)
            if (data) {
                this.saveFile(tempPath, data.remote, data.sshConfig)
            }
        })
    }
    // usage: https://www.npmjs.com/package/redis
    async getChildren(element?: Node) {
        try {
            if (!element) {
                const config = this.getConnections();
                const nodes = Object.keys(config).map(key => {
                    const sshConfig = config[key];
                    if (sshConfig.private && existsSync(sshConfig.private)) {
                        sshConfig.privateKey = require('fs').readFileSync(sshConfig.private)
                    }
                    key=`${sshConfig.name ? sshConfig.name + "_" : ""}${key}`
                    return new SSHConnectionNode(sshConfig, key);
                });
                return nodes
            } else {
                return element.getChildren()
            }
        } catch (error) {
            return [new InfoNode(error)]
        }
    }

    async saveFile(tempPath: string, remotePath: string, sshConfig: SSHConfig) {
        const { sftp } = await ClientManager.getSSH(sshConfig)
        sftp.fastPut(tempPath, remotePath, async (err) => {
            if (err) {
                vscode.window.showErrorMessage(err.message)
            } else {
                vscode.commands.executeCommand(CommandKey.Refresh)
                vscode.window.showInformationMessage("Update to remote success!")
            }
        })
    }

}