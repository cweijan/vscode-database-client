import mysqldump from 'mysqldump';
import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/constants";
import { FileManager } from '../../common/filesManager';
import { Console } from "../../common/outputChannel";
import { Util } from '../../common/util';
import { ConnectionManager } from "../../service/connectionManager";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { DbTreeDataProvider } from '../../provider/treeDataProvider';
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { FunctionGroup } from "../main/functionGroup";
import { ProcedureGroup } from "../main/procedureGroup";
import { TableGroup } from "../main/tableGroup";
import { TriggerGroup } from "../main/triggerGroup";
import { ViewGroup } from "../main/viewGroup";
import { NodeUtil } from '../nodeUtil';

export class DatabaseNode extends Node implements CopyAble {

    public contextValue: string = ModelType.DATABASE;
    public iconPath: string = path.join(Constants.RES_PATH, "icon/database.svg");
    constructor(name: string, readonly info: Node) {
        super(name)
        this.id = `${info.getConnectId()}_${name}`
        this.info = NodeUtil.of({ ...info, database: name } as Node)
        this.init(this.info)
        const lcp = ConnectionManager.getLastConnectionOption(false);
        if (lcp.getConnectId() == this.getConnectId() && lcp.database == this.database) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/database-active.svg");
            this.description = `Active`
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [new TableGroup(this.info),
        new ViewGroup(this.info),
        new ProcedureGroup(this.info),
        new FunctionGroup(this.info),
        new TriggerGroup(this.info)];
    }

    public importData(fsPath: string) {
        Console.log(`Doing import ${this.getConnectId()}...`);
        ConnectionManager.getConnection(this).then((connection) => {
            QueryUnit.runFile(connection, fsPath);
        });
    }

    public dropDatatabase() {

        vscode.window.showInputBox({ prompt: `Are you want to Delete Database ${this.database} ?     `, placeHolder: 'Input database name to confirm.' }).then(async (inputContent) => {
            if (inputContent && inputContent.toLowerCase() == this.database.toLowerCase()) {
                QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP DATABASE \`${this.database}\``).then(() => {
                    DatabaseCache.clearDatabaseCache(`${this.getConnectId()}`)
                    DbTreeDataProvider.refresh();
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
        Util.copyToBoard(this.database)
    }

}
