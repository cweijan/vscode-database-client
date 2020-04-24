import * as vscode from "vscode";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ConnectionInfo } from "./connection";
import { SSHConfig } from "./sshConfig";

export abstract class Node extends vscode.TreeItem {
    public host: string;
    public port: string;
    public user: string;
    public password?: string;
    public database?: string;
    public abstract iconPath: string;
    public multipleStatements?: boolean;
    public certPath?: string;
    public usingSSH?: boolean;
    public ssh?: SSHConfig;

    constructor(id: string) {
        super(id)
    }

    // getTreeItem(): Promise<vscode.TreeItem> | vscode.TreeItem;

    public abstract getChildren(isRresh?: boolean): Promise<Node[]>;

    protected init(info: ConnectionInfo) {
        this.host = info.host
        this.port = info.port
        this.user = info.user
        this.password = info.password
        this.database = info.database
        this.multipleStatements = info.multipleStatements
        this.certPath = info.certPath
        this.ssh = info.ssh
        this.usingSSH = info.usingSSH
        this.collapsibleState = DatabaseCache.getElementState(this)
    }

}
