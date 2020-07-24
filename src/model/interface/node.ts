import * as vscode from "vscode";
import { DatabaseCache } from "../../service/common/databaseCache";
import { SSHConfig } from "./sshConfig";

export abstract class Node extends vscode.TreeItem {

    public host: string;
    public port: number;
    public user: string;
    public password?: string;
    public database?: string;
    public name?: string;
    public timezone?: string;
    public certPath?: string;
    public excludeDatabases?: string;

    public usingSSH?: boolean;
    public ssh?: SSHConfig;

    constructor(id: string) {
        super(id)
    }

    protected init(source: Node) {
        this.host = source.host
        this.port = source.port
        this.user = source.user
        this.password = source.password
        this.database = source.database
        this.timezone = source.timezone
        this.certPath = source.certPath
        this.ssh = source.ssh
        this.usingSSH = source.usingSSH
        this.excludeDatabases = source.excludeDatabases
        this.collapsibleState = DatabaseCache.getElementState(this)
    }

    public getChildren(isRresh?: boolean): Node[] | Promise<Node[]> {
        return []
    }

    public getConnectId(): string {
        if (this.usingSSH && this.ssh) {
            return `${this.ssh.host}_${this.ssh.port}_${this.ssh.username}`;
        }
        return `${this.host}_${this.port}_${this.user}`;
    }

    public getHost(): string { return this.usingSSH ? this.ssh.host : this.host }
    public getPort(): number { return this.usingSSH ? this.ssh.port : this.port }
    public getUser(): string { return this.usingSSH ? this.ssh.username : this.user }

}
