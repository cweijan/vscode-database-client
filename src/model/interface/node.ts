import { DatabaseType, ModelType } from "@/common/constants";
import { Util } from "@/common/util";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";
import { ConnectionManager } from "@/service/connectionManager";
import { SqlDialect } from "@/service/dialect/sqlDialect";
import { QueryUnit } from "@/service/queryUnit";
import { ServiceManager } from "@/service/serviceManager";
import * as vscode from "vscode";
import { Memento } from "vscode";
import { resourceLimits } from "worker_threads";
import { DatabaseCache } from "../../service/common/databaseCache";
import { NodeUtil } from "../nodeUtil";
import { CopyAble } from "./copyAble";
import { SSHConfig } from "./sshConfig";

export interface SwitchOpt {
    isGlobal?: boolean;
    withDb?: boolean;
    withDbForce?: boolean;
}

export abstract class Node extends vscode.TreeItem implements CopyAble {

    /**
     * using as cache key
     */
    public uid: string;

    public host: string;
    public port: number;
    public user: string;
    public password?: string;
    public database?: string;
    public name?: string;
    public timezone?: string;
    public connectTimeout?: number;
    public requestTimeout?: number;
    public certPath?: string;
    public includeDatabases?: string;

    public global?: boolean;
    public disable?: boolean;
    public usingSSH?: boolean;
    public ssh?: SSHConfig;
    public dbType?: DatabaseType;
    public dialect?: SqlDialect;
    /**
     * mssql
     */
    public encrypt?: boolean;

    /**
     * contenxt
     */
    public provider?: DbTreeDataProvider;
    public context?: Memento;

    /**
     * es only
     */
    public scheme: string;
    /**
     * database only
     */
    public schema: string;

    constructor(uid: string) {
        super(uid)
    }
    copyName(): void {
        Util.copyToBoard(this.label)
    }

    protected init(source: Node) {
        this.host = source.host
        this.port = source.port
        this.user = source.user
        this.password = source.password
        if (!this.database) this.database = source.database
        this.timezone = source.timezone
        this.certPath = source.certPath
        this.ssh = source.ssh
        this.usingSSH = source.usingSSH
        this.scheme = source.scheme
        if (!this.schema) {
            this.schema = source.schema
        }
        this.global = source.global
        this.dbType = source.dbType
        if (source.connectTimeout) {
            this.connectTimeout = parseInt(source.connectTimeout as any)
            source.connectTimeout = parseInt(source.connectTimeout as any)
        }
        if (source.requestTimeout) {
            this.requestTimeout = parseInt(source.requestTimeout as any)
            source.requestTimeout = parseInt(source.requestTimeout as any)
        }
        this.encrypt = source.encrypt
        this.disable = source.disable
        this.includeDatabases = source.includeDatabases
        if (!this.provider) this.provider = source.provider
        if (!this.context) this.context = source.context
        // init dialect
        if (!this.dialect && this.dbType != DatabaseType.REDIS) {
            this.dialect = ServiceManager.getDialect(this.dbType)
        }
        if (this.disable) {
            this.command = { command: "mysql.connection.open", title: "Open Connection", arguments: [this] }
        }
        this.initUid();
        // init tree state
        this.collapsibleState = DatabaseCache.getElementState(this)
    }


    public async refresh() {
        await this.getChildren(true)
        this.provider.reload(this)
    }

    public initUid() {
        if (this.uid) return;
        if (this.contextValue == ModelType.CONNECTION) {
            this.uid = this.getConnectId();
        } else if (this.contextValue == ModelType.DATABASE) {
            this.uid = `${this.getConnectId({ withDbForce: true })}`;
        } else {
            this.uid = `${this.getConnectId({ withDbForce: true })}#${this.label}`;
        }
    }

    public async indent(command: IndentCommand) {

        const cacheKey = command.cacheKey || this.provider?.connectionKey;
        const connections = this.context.get<{ [key: string]: Node }>(cacheKey, {});
        if (!this.uid) {
            this.uid = this.getConnectId();
        }

        switch (command.command) {
            case CommandKey.add:
                connections[this.uid] = NodeUtil.removeParent(this);
                break;
            case CommandKey.update:
                connections[this.uid] = NodeUtil.removeParent(this);
                ConnectionManager.removeConnection(this.uid)
                DatabaseCache.clearDatabaseCache(this.uid)
                break;
            case CommandKey.delete:
                ConnectionManager.removeConnection(this.uid)
                delete connections[this.uid]
            default:
                break;
        }


        await this.context.update(cacheKey, connections);

        if (command.refresh !== false) {
            DbTreeDataProvider.refresh();
        }

    }

    public static nodeCache = {};
    public cacheSelf() {
        if (this.contextValue == ModelType.CONNECTION || this.contextValue == ModelType.ES_CONNECTION) {
            Node.nodeCache[`${this.getConnectId()}`] = this;
        } else if (this.contextValue == ModelType.DATABASE) {
            Node.nodeCache[`${this.getConnectId({ withDbForce: true })}`] = this;
        } else {
            Node.nodeCache[`${this.uid}`] = this;
        }
    }
    public getCache() {
        if (this.schema) {
            return Node.nodeCache[`${this.getConnectId({ withDbForce: true })}`]
        }
        return Node.nodeCache[`${this.getConnectId()}`]
    }

    public getByRegion<T extends Node>(region?: string): T {
        if (!region) {
            return Node.nodeCache[`${this.getConnectId({ withDbForce: true })}`]
        }
        return Node.nodeCache[`${this.getConnectId({ withDbForce: true })}#${region}`]
    }

    public getChildren(isRresh?: boolean): Node[] | Promise<Node[]> {
        return []
    }

    public getConnectId(opt?: SwitchOpt): string {

        const targetGlobal = opt?.isGlobal != null ? opt.isGlobal : this.global;
        const prefix = targetGlobal === false ? "workspace" : "global";

        let uid = (this.usingSSH && this.ssh) ? `${prefix}_${this.ssh.host}_${this.ssh.port}_${this.ssh.username}`
            : `${prefix}_${this.host}_${this.port}_${this.user}`;


        if (opt?.withDbForce && this.schema) {
            return `${uid}_${this.schema}`
        }

        /**
         * mssql and postgres must special database when connect.
         */
        if (opt?.withDb && this.database && (this.dbType == DatabaseType.MSSQL || this.dbType == DatabaseType.PG)) {
            return `${uid}_${this.database}`
        }

        return uid;
    }


    public getHost(): string { return this.usingSSH ? this.ssh.host : this.host }
    public getPort(): number { return this.usingSSH ? this.ssh.port : this.port }
    public getUser(): string { return this.usingSSH ? this.ssh.username : this.user }

    public async execute<T>(sql: string,sessionId?:string): Promise<T> {
        return (await QueryUnit.queryPromise<T>(await ConnectionManager.getConnection(this,{sessionId}), sql)).rows
    }

    public async getConnection() {
        return ConnectionManager.getConnection(this)
    }

    public wrap(origin: string) {
        return Util.wrap(origin, this.dbType)
    }

}
export class IndentCommand {
    command: CommandKey;
    refresh?: boolean;
    cacheKey?: string;
}
export enum CommandKey {
    update, add, delete
}