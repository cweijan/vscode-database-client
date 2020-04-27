import * as vscode from "vscode";
import { DatabaseCache } from "../../service/databaseCache";
import { SSHConfig } from "./sshConfig";

export abstract class Node extends vscode.TreeItem {

    public host: string;
    public port: string;
    public user: string;
    public password?: string;
    public database?: string;
    public timezone?: string;
    public certPath?: string;
    public origin?: Node;

    public usingSSH?: boolean;
    public ssh?: SSHConfig;

    constructor(id: string) {
        super(id)
    }

    public getChildren(isRresh?: boolean): Node[] | Promise<Node[]> {
        return []
    }

    public getConnectId(): string {
        return `${this.host}_${this.port}_${this.user}`;
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
        this.collapsibleState = DatabaseCache.getElementState(this)
        this.origin = source.origin
    }

}
