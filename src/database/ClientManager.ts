import { Client } from "ssh2";
import * as vscode from 'vscode';
import { SSHConfig } from '../model/interface/sshConfig';

export class ClientManager {

    private static activeClient: { [key: string]: Client } = {};

    public static getSSH(sshConfig: SSHConfig): Promise<Client> {

        const key = `${sshConfig.host}_${sshConfig.port}_${sshConfig.username}`;
        if (this.activeClient[key]) {
            return Promise.resolve(this.activeClient[key]);
        }

        const client = new Client();
        return new Promise((resolve) => {
            client.on('ready', () => {
                this.activeClient[key] = client;
                resolve(this.activeClient[key])
            }).on('error', (err) => {
                vscode.window.showErrorMessage(err.message)
                resolve(null)
            }).on('end', () => {
                this.activeClient[key] = null
            }).connect(sshConfig);
        })

    }

}