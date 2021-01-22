import * as path from "path";
import * as vscode from "vscode";
import { Constants, DatabaseType, ModelType } from "../../common/constants";
import { FileManager } from '../../common/filesManager';
import { Util } from '../../common/util';
import { DbTreeDataProvider } from '../../provider/treeDataProvider';
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { QueryUnit } from "../../service/queryUnit";
import { ServiceManager } from "../../service/serviceManager";
import { DiagramGroup } from "../diagram/diagramGroup";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { FunctionGroup } from "../main/functionGroup";
import { ProcedureGroup } from "../main/procedureGroup";
import { TableGroup } from "../main/tableGroup";
import { TriggerGroup } from "../main/triggerGroup";
import { ViewGroup } from "../main/viewGroup";
import { NodeUtil } from '../nodeUtil';
import { QueryGroup } from "../query/queryGroup";

export class DatabaseNode extends Node implements CopyAble {

    
    public contextValue: string = ModelType.DATABASE;
    public iconPath: string = path.join(Constants.RES_PATH, "icon/database.svg");
    constructor(name: string, readonly parent: Node) {
        super(name)
        this.uid = `${parent.getConnectId()}_${name}`
        this.parent = NodeUtil.of({ ...parent, database: name } as Node)
        this.init(this.parent)
        this.cacheSelf()
        const lcp = ConnectionManager.getLastConnectionOption(false);
        if (lcp && lcp.getConnectId() == this.getConnectId() && lcp.database == this.database) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/database-active.svg");
            this.description = `Active`
        }
    }

    public getChildren(): Promise<Node[]>|Node[] {

        if(this.dbType==DatabaseType.MONGO_DB){
            return [
                new TableGroup(this)
            ]
        }

        return [
            new TableGroup(this), new ViewGroup(this),
            new QueryGroup(this), new DiagramGroup(this),
            new ProcedureGroup(this), new FunctionGroup(this), new TriggerGroup(this)
        ];
    }

    public openOverview() {
        ServiceManager.instance.overviewService.openOverview(this)
    }

    public dropDatatabase() {

        vscode.window.showInputBox({ prompt: `Are you want to drop database ${this.database} ?     `, placeHolder: 'Input database name to confirm.' }).then(async (inputContent) => {
            if (inputContent && inputContent.toLowerCase() == this.database.toLowerCase()) {
                this.execute(`DROP DATABASE ${this.wrap(this.database)}`).then(() => {
                    DatabaseCache.clearDatabaseCache(`${this.getConnectId()}`)
                    DbTreeDataProvider.refresh(this.parent);
                    vscode.window.showInformationMessage(`Drop database ${this.database} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel drop database ${this.database}!`)
            }
        })

    }


    public async truncateDb() {


        vscode.window.showInputBox({ prompt: `Dangerous: Are you want to truncate database ${this.database} ?     `, placeHolder: 'Input database name to confirm.' }).then(async (inputContent) => {
            if (inputContent && inputContent.toLowerCase() == this.database.toLowerCase()) {
                const connection = await ConnectionManager.getConnection(this);
                QueryUnit.queryPromise(connection, this.dialect.truncateDatabase(this.database)).then(async (res: any) => {
                    await QueryUnit.runBatch(connection, res.map(data => data.trun))
                    vscode.window.showInformationMessage(`Truncate database ${this.database} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel truncate database ${this.database}!`)
            }
        })

    }

    public async newQuery() {

        FileManager.show(`${this.uid}.sql`)

    }

    public copyName() {
        Util.copyToBoard(this.database)
    }

}
