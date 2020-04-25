import mysqldump from 'mysqldump';
import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/Constants";
import { Console } from "../../common/OutputChannel";
import { Util } from '../../common/util';
import { ConnectionManager } from "../../database/ConnectionManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { FileManager } from '../../common/FileManager';
import { MySQLTreeDataProvider } from "../../provider/MysqlTreeDataProvider";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { FunctionGroup } from "../main/functionGroup";
import { ProcedureGroup } from "../main/procedureGroup";
import { TriggerGroup } from "../main/triggerGroup";
import { TableGroup } from "../main/tableGroup";
import { ViewGroup } from "../main/viewGroup";

import format = require('date-format');

export class DatabaseNode extends Node implements CopyAble {

    public contextValue: string = ModelType.DATABASE;
    public iconPath: string = path.join(Constants.RES_PATH, "database.svg");
    constructor(readonly name: string, readonly info: Node) {
        super(name)
        this.id = `${info.host}_${info.port}_${info.user}_${name}`
        this.info = Object.assign({ ...info }, { database: name }) as Node
        this.init(this.info)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [new TableGroup(this.info),
        new ViewGroup(this.info),
        new ProcedureGroup(this.info),
        new FunctionGroup(this.info),
        new TriggerGroup(this.info)];
    }

    public importData(fsPath: string) {
        Console.log(`Doing import ${this.host}:${this.port}_${this.name}...`);
        ConnectionManager.getConnection(this).then((connection) => {
            QueryUnit.runFile(connection, fsPath);
        });
    }

    public backupData(exportPath: string) {

        Console.log(`Doing backup ${this.host}_${this.name}...`);
        mysqldump({
            connection: {
                host: this.host,
                user: this.user,
                password: this.password,
                database: this.name,
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
            dumpToFile: `${exportPath}\\${this.name}_${format('yyyy-MM-dd_hhmmss', new Date())}.sql`,
        }).then(() => {
            vscode.window.showInformationMessage(`Backup ${this.host}_${this.name} success!`);
        }).catch((err) => {
            vscode.window.showErrorMessage(`Backup ${this.host}_${this.name} fail!\n${err}`);
        });
        Console.log("backup end.");

    }

    public dropDatatabase() {

        Util.confirm(`Are you want to Drop Database ${this.name} ? `, async () => {
            QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP DATABASE \`${this.name}\``).then(() => {
                DatabaseCache.clearDatabaseCache(`${this.host}_${this.port}_${this.user}`);
                MySQLTreeDataProvider.refresh();
                vscode.window.showInformationMessage(`Delete database ${this.name} success!`);
            });
        })

    }


    public async newQuery() {

        FileManager.show(`${this.id}.sql`)
        ConnectionManager.getConnection(this, true);

    }

    public copyName() {
        Util.copyToBoard(this.name)
    }

}
