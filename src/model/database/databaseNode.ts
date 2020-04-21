import mysqldump from 'mysqldump';
import * as path from "path";

import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/Constants";
import { Console } from "../../common/OutputChannel";
import { ConnectionManager } from "../../database/ConnectionManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { MySQLTreeDataProvider } from "../../provider/MysqlTreeDataProvider";
import { ConnectionInfo } from "../interface/connection";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { FunctionGroup } from "../other/functionGroup";
import { ProcedureGroup } from "../other/procedureGroup";
import { TriggerGroup } from "../other/triggerGroup";
import { TableGroup } from "../table/tableGroup";
import { ViewGroup } from "../table/viewGroup";
import { Util } from '../../common/util';
import { FileManager } from '../../extension/FileManager';
import format = require('date-format');

export class DatabaseNode implements Node, ConnectionInfo, CopyAble {

    public identify: string;
    public type: string = ModelType.DATABASE;
    constructor(readonly host: string, readonly user: string,
        readonly password: string, readonly port: string, readonly database: string,
        readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {

        this.identify = `${this.host}_${this.port}_${this.user}_${this.database}`;
        return {
            label: this.database,
            id: this.identify,
            collapsibleState: DatabaseCache.getElementState(this),
            contextValue: ModelType.DATABASE,
            iconPath: path.join(Constants.RES_PATH, "database.svg"),
        };

    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        return [new TableGroup(this.host, this.user, this.password, this.port, this.database, this.certPath),
        new ViewGroup(this.host, this.user, this.password, this.port, this.database, this.certPath),
        new ProcedureGroup(this.host, this.user, this.password, this.port, this.database, this.certPath),
        new FunctionGroup(this.host, this.user, this.password, this.port, this.database, this.certPath),
        new TriggerGroup(this.host, this.user, this.password, this.port, this.database, this.certPath)];
    }

    public importData(fsPath: string) {
        Console.log(`Doing import ${this.host}:${this.port}_${this.database}...`);
        ConnectionManager.getConnection(this).then((connection) => {
            QueryUnit.runFile(connection, fsPath);
        });
    }

    public backupData(exportPath: string) {

        Console.log(`Doing backup ${this.host}_${this.database}...`);
        mysqldump({
            connection: {
                host: this.host,
                user: this.user,
                password: this.password,
                database: this.database,
                port: parseInt(this.port),
            },
            dump: {
                schema: {
                    table: {
                        ifNotExist: false,
                        dropIfExist: true,
                        charset: false,
                    },
                    engine: false,
                },
            },
            dumpToFile: `${exportPath}\\${this.database}_${format('yyyy-MM-dd_hhmmss', new Date())}.sql`,
        }).then(() => {
            vscode.window.showInformationMessage(`Backup ${this.host}_${this.database} success!`);
        }).catch((err) => {
            vscode.window.showErrorMessage(`Backup ${this.host}_${this.database} fail!\n${err}`);
        });
        Console.log("backup end.");

    }

    public dropDatatabase() {

        Util.confirm(`Are you want to Drop Database ${this.database} ? `, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP DATABASE \`${this.database}\``).then(() => {
                DatabaseCache.clearDatabaseCache(`${this.host}_${this.port}_${this.user}`);
                MySQLTreeDataProvider.refresh();
                vscode.window.showInformationMessage(`Delete database ${this.database} success!`);
            });
        })

    }


    public async newQuery() {

        FileManager.show(`${this.identify}.sql`)
        // QueryUnit.createSQLTextDocument();
        ConnectionManager.getConnection(this, true);

    }

    public copyName() {
        Util.copyToBoard(this.database)
    }

}
