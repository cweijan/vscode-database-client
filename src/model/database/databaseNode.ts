import mysqldump from 'mysqldump';
import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/Constants";
import { FileManager } from '../../common/FileManager';
import { Console } from "../../common/OutputChannel";
import { Util } from '../../common/util';
import { ConnectionManager } from "../../database/ConnectionManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { MySQLTreeDataProvider } from '../../provider/mysqlTreeDataProvider';
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { FunctionGroup } from "../main/functionGroup";
import { ProcedureGroup } from "../main/procedureGroup";
import { TableGroup } from "../main/tableGroup";
import { TriggerGroup } from "../main/triggerGroup";
import { ViewGroup } from "../main/viewGroup";

import format = require('date-format');

export class DatabaseNode extends Node implements CopyAble {

    public contextValue: string = ModelType.DATABASE;
    public iconPath: string = path.join(Constants.RES_PATH, "database.svg");
    constructor(readonly name: string, readonly info: Node) {
        super(name)
        this.id = `${info.getConnectId()}_${name}`
        this.info = { ...info, database: name, getConnectId: info.getConnectId } as Node
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

        vscode.window.showInputBox({ prompt: `Are you want to Delete Database ${this.database} ?     `, placeHolder: 'Input database name to confirm.' }).then(async (inputContent) => {
            if (inputContent.toLowerCase() == this.database.toLowerCase()) {
                QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP DATABASE ${this.database}`).then(() => {
                    DatabaseCache.clearDatabaseCache(`${this.host}_${this.port}_${this.user}`)
                    MySQLTreeDataProvider.refresh();
                    vscode.window.showInformationMessage(`Delete database ${this.database} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel delete database ${this.database}!`)
            }
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
