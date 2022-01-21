import { Global } from "./global";
import * as vscode from "vscode";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export class GlobalState {
    public static update(key: string, value: any): Thenable<void> {
        key = getKey(key)
        return Global.context.globalState.update(key, value)
    }

    public static get<T>(key: string, defaultValue?: T): T {
        key = getKey(key)
        return Global.context.globalState.get(key, defaultValue)
    }
}

export class WorkState {

    public static async update(key: string, value: any): Promise<void> {
        const config = this.getConfig()
        if (!config) {
            return Global.context.workspaceState.update(key, value)
        }
        config[key] = value;
        const parentFolder = join(vscode.workspace.rootPath, '.vscode')
        if (!existsSync(parentFolder)) {
            mkdirSync(parentFolder)
        }
        const configPath = join(vscode.workspace.rootPath, '.vscode', 'datbase-client.json')
        writeFileSync(configPath, JSON.stringify(config, null, 4))
    }

    public static get<T>(key: string, defaultValue?: T): T {
        const config = this.getConfig()
        if (!config) {
            return Global.context.workspaceState.get(key, defaultValue)
        };
        return config[key] || defaultValue;
    }

    private static getConfig() {
        const rootPath = vscode.workspace.rootPath;
        if (!rootPath) return null;
        const configPath = join(rootPath, '.vscode', 'datbase-client.json')
        if (!existsSync(configPath)) {
            return {}
        }
        try {
            return JSON.parse(readFileSync(configPath, 'utf8'))
        } catch (error) {
            return {}
        }
    }

}
export function getKey(key: string): string {

    if (vscode.env.remoteName == "ssh-remote" && key.indexOf("ssh-remote") == -1) {
        return key + "ssh-remote";
    }

    return key;
}

