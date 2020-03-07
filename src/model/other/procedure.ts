import * as path from "path";
import * as vscode from "vscode";
import { QueryUnit } from "../../database/QueryUnit";
import { INode } from "../INode";
import { DatabaseCache } from "../../database/DatabaseCache";
import { ModelType, Constants } from "../../common/Constants";
import { IConnection } from "../Connection";
import { ConnectionManager } from "../../database/ConnectionManager";
import { MySQLTreeDataProvider } from "../../provider/MysqlTreeDataProvider";


export class ProcedureNode implements INode, IConnection {
    identify: string;
    type: string = ModelType.TABLE;

    constructor(readonly host: string, readonly user: string, readonly password: string,
        readonly port: string, readonly database: string, readonly name: string,
        readonly certPath: string) {
    }

    public getTreeItem(): vscode.TreeItem {

        this.identify = `${this.host}_${this.port}_${this.user}_${this.database}_${this.name}`
        return {
            label: this.name,
            // collapsibleState: DatabaseCache.getElementState(this),
            // contextValue: ModelType.TABLE,
            iconPath: path.join(Constants.RES_PATH, "procedure.svg"),
            command: {
                command: "mysql.show.procedure",
                title: "Show Procedure Create Source",
                arguments: [this, true]
            }
        };

    }

    async showSource() {
        QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SHOW CREATE PROCEDURE ${this.database}.${this.name}`)
            .then((procedDtail) => {
                procedDtail = procedDtail[0]
                QueryUnit.createSQLTextDocument(`DELIMITER $$\n\nDROP PROCEDURE IF EXISTS ${procedDtail['Procedure']}$$ \n\n${procedDtail['Create Procedure']}$$\n\nDELIMITER ;`);
            });
    }

    public async getChildren(isRresh: boolean = false): Promise<INode[]> {
        return [];
        // this.identify = `${this.host}_${this.port}_${this.user}_${this.database}_${this.table}`
        // let columnNodes = DatabaseCache.getColumnListOfTable(this.identify)
        // if (columnNodes && !isRresh) {
        //     return columnNodes;
        // }
        // return QueryUnit.queryPromise<any[]>(await ConnectionManager.getConnection(this), `SELECT * FROM information_schema.columns WHERE table_schema = '${this.database}' AND table_name = '${this.table}';`)
        //     .then((columns) => {
        //         columnNodes = columns.map<ColumnNode>((column) => {
        //             return new ColumnNode(this.host, this.user, this.password, this.port, this.database, this.table, this.certPath, column);
        //         })
        //         DatabaseCache.setColumnListOfTable(this.identify, columnNodes)

        //         return columnNodes;
        //     })
        //     .catch((err) => {
        //         return [new InfoNode(err)];
        //     });
    }


    public dropTable(sqlTreeProvider: MySQLTreeDataProvider) {

        vscode.window.showInputBox({ prompt: `Are you want to drop table ${this.name} ?     `, placeHolder: 'Input y to confirm.' }).then(async inputContent => {
            if (inputContent.toLocaleLowerCase() == 'y') {
                QueryUnit.queryPromise(await ConnectionManager.getConnection(this), `DROP TABLE ${this.database}.${this.name}`).then(() => {
                    DatabaseCache.clearTableCache(`${this.host}_${this.port}_${this.user}_${this.database}`)
                    sqlTreeProvider.refresh()
                    vscode.window.showInformationMessage(`Delete table ${this.name} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel delete table ${this.name}!`)
            }
        })

    }

}
