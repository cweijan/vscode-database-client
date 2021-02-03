import { Global } from "@/common/global";
import * as path from "path";
import * as vscode from "vscode";
import { Constants, ModelType } from "../../common/constants";
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
import { QueryGroup } from "../query/queryGroup";

export class SchemaNode extends Node implements CopyAble {


    public contextValue: string = ModelType.SCHEMA;
    public iconPath: string = path.join(Constants.RES_PATH, "icon/database.svg");
    constructor(public schema: string,  readonly parent: Node) {
        super(schema)
        this.init(this.parent)
        this.cacheSelf()
        const lcp = ConnectionManager.getLastConnectionOption(false);
        if (lcp && lcp.getConnectId() == this.getConnectId() && (lcp.database == this.database ) && (lcp.schema == this.schema )) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/database-active.svg");
            this.description = `Active`
        }
    }

    public getChildren(): Promise<Node[]> | Node[] {

        let childs: Node[] = [new TableGroup(this)];

        if (Global.getConfig('showView')) {
            childs.push(new ViewGroup(this))
        }

        if (Global.getConfig('showQuery')) {
            childs.push(new QueryGroup(this))
        }
        if (Global.getConfig('showDiagram')) {
            childs.push(new DiagramGroup(this))
        }
        if (Global.getConfig('showProcedure')) {
            childs.push(new ProcedureGroup(this))
        }
        if (Global.getConfig('showFunction')) {
            childs.push(new FunctionGroup(this))
        }
        if (Global.getConfig('showTrigger')) {
            childs.push(new TriggerGroup(this))
        }

        return childs;
    }

    public dropDatatabase() {

        vscode.window.showInputBox({ prompt: `Are you want to drop database ${this.schema} ?     `, placeHolder: 'Input database name to confirm.' }).then(async (inputContent) => {
            if (inputContent && inputContent.toLowerCase() == this.schema.toLowerCase()) {
                this.execute(`DROP DATABASE ${this.wrap(this.schema)}`).then(() => {
                    DatabaseCache.clearDatabaseCache(`${this.getConnectId()}`)
                    DbTreeDataProvider.refresh(this.parent);
                    vscode.window.showInformationMessage(`Drop database ${this.schema} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel drop database ${this.schema}!`)
            }
        })

    }


    public async truncateDb() {


        vscode.window.showInputBox({ prompt: `Dangerous: Are you want to truncate database ${this.schema} ?     `, placeHolder: 'Input database name to confirm.' }).then(async (inputContent) => {
            if (inputContent && inputContent.toLowerCase() == this.schema.toLowerCase()) {
                const connection = await ConnectionManager.getConnection(this);
                QueryUnit.queryPromise(connection, this.dialect.truncateDatabase(this.schema)).then(async (res: any) => {
                    await QueryUnit.runBatch(connection, res.map(data => data.trun))
                    vscode.window.showInformationMessage(`Truncate database ${this.schema} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel truncate database ${this.schema}!`)
            }
        })

    }

    public async newQuery() {

        QueryUnit.showSQLTextDocument(this,'',`${this.schema}.sql`)

    }

    public copyName() {
        Util.copyToBoard(this.schema)
    }

}
