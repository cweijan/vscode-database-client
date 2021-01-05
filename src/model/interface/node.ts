import { DatabaseType } from "@/common/constants";
import { getDialect, SqlDialect } from "@/service/dialect/sqlDialect";
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
    public includeDatabases?: string;
    public excludeDatabases?: string;

    public global?: boolean;
    public usingSSH?: boolean;
    public ssh?: SSHConfig;
    public dbType?: DatabaseType;
    public dialect?: SqlDialect;

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
        this.global = source.global
        this.dbType=source.dbType
        if(!this.dialect){
            this.dialect=getDialect(this.dbType)
        }
        this.includeDatabases = source.includeDatabases
        this.excludeDatabases = source.excludeDatabases
        this.collapsibleState = DatabaseCache.getElementState(this)
    }

    public getChildren(isRresh?: boolean): Node[] | Promise<Node[]> {
        return []
    }

    public getConnectId(SpecGlobal?: boolean): string {

        const targetGlobal = SpecGlobal != null ? SpecGlobal : this.global;
        const prefix = targetGlobal === false ? "workspace" : "global";

        if (this.usingSSH && this.ssh) {
            return `${prefix}_${this.ssh.host}_${this.ssh.port}_${this.ssh.username}`;
        }
        return `${prefix}_${this.host}_${this.port}_${this.user}`;
    }

    public getHost(): string { return this.usingSSH ? this.ssh.host : this.host }
    public getPort(): number { return this.usingSSH ? this.ssh.port : this.port }
    public getUser(): string { return this.usingSSH ? this.ssh.username : this.user }

}
