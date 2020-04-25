import * as vscode from "vscode";
import { DatabaseCache } from "../../database/DatabaseCache";
import { SSHConfig } from "./sshConfig";

export abstract class Node extends vscode.TreeItem {

    public host: string;
    public port: string;
    public user: string;
    public password?: string;
    public database?: string;
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

    protected init(info: Node) {
        this.host = info.host
        this.port = info.port
        this.user = info.user
        this.password = info.password
        this.database = info.database
        this.certPath = info.certPath
        this.ssh = info.ssh
        this.usingSSH = info.usingSSH
        this.collapsibleState = DatabaseCache.getElementState(this)
    }

}
