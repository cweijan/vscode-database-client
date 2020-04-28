"use strict";

import * as vscode from "vscode";
import { CommandKey } from "./common/constants";
import { ConnectionNode } from "./model/database/connectionNode";
import { DatabaseNode } from "./model/database/databaseNode";
import { UserGroup, UserNode } from "./model/database/userGroup";
import { CopyAble } from "./model/interface/copyAble";
import { FunctionNode } from "./model/main/function";
import { FunctionGroup } from "./model/main/functionGroup";
import { ProcedureNode } from "./model/main/procedure";
import { ProcedureGroup } from "./model/main/procedureGroup";
import { TableGroup } from "./model/main/tableGroup";
import { TableNode } from "./model/main/tableNode";
import { TriggerNode } from "./model/main/trigger";
import { TriggerGroup } from "./model/main/triggerGroup";
import { ViewGroup } from "./model/main/viewGroup";
import { ViewNode } from "./model/main/viewNode";
import { ColumnNode } from "./model/other/columnNode";
import { Console } from "./common/outputChannel";
// Don't change last order, it will occur circular reference
import { ServiceManager } from "./service/serviceManager";
import { QueryUnit } from "./service/queryUnit";

export function activate(context: vscode.ExtensionContext) {

    const serviceManager = new ServiceManager(context)

    context.subscriptions.push(
        ...serviceManager.init(),
        ...initCommand({
            "mysql.history.open": () => serviceManager.historyService.showHistory(),
            [CommandKey.Refresh]: () => { serviceManager.provider.init(); },
            [CommandKey.RecordHistory]: (sql: string, costTime: number) => {
                serviceManager.historyService.recordHistory(sql, costTime);
            },
            "mysql.setting.open": () => {
                serviceManager.settingService.open();
            },
            "mysql.db.active": () => {
                serviceManager.provider.activeDb();
            },
            "mysql.mock.table": (tableNode: TableNode) => {
                serviceManager.mockRunner.create(tableNode)
            },
            "mysql.mock.run": () => {
                serviceManager.mockRunner.runMock()
            },
            "mysql.connection.add": () => {
                serviceManager.connectService.openConnect(serviceManager.provider)
            },
            "mysql.connection.edit": (connectionNode: ConnectionNode) => {
                serviceManager.connectService.openConnect(serviceManager.provider, connectionNode)
            },
            "mysql.database.add": (connectionNode: ConnectionNode) => {
                connectionNode.createDatabase();
            },
            "mysql.deleteDatabase": (databaseNode: DatabaseNode) => {
                databaseNode.dropDatatabase();
            },
            "mysql.changeTableName": (tableNode: TableNode) => {
                tableNode.changeTableName();
            },
            "mysql.index.template": (tableNode: TableNode) => {
                tableNode.indexTemplate();
            },
            "mysql.table.truncate": (tableNode: TableNode) => {
                tableNode.truncateTable();
            },
            "mysql.table.drop": (tableNode: TableNode) => {
                tableNode.dropTable();
            },
            "mysql.table.source": (tableNode: TableNode) => {
                if (tableNode) { tableNode.showSource(); }
            },
            "mysql.column.changeName": (columnNode: ColumnNode) => {
                columnNode.changeColumnName();
            },
            "mysql.column.add": (tableNode: TableNode) => {
                tableNode.addColumnTemplate();
            },
            "mysql.column.update": (columnNode: ColumnNode) => {
                columnNode.updateColumnTemplate();
            },
            "mysql.column.drop": (columnNode: ColumnNode) => {
                columnNode.dropColumnTemplate();
            },
            "mysql.connection.delete": (connectionNode: ConnectionNode) => {
                connectionNode.deleteConnection(context);
            },
            "mysql.runQuery": (sql) => {
                if (typeof sql != 'string') { sql = null; }
                QueryUnit.runQuery(sql);
            },
            "mysql.query.switch": (databaseOrConnectionNode: DatabaseNode | ConnectionNode) => {
                if (databaseOrConnectionNode) {
                    databaseOrConnectionNode.newQuery();
                } else {
                    ConnectionNode.tryOpenQuery();
                }
            },
            "mysql.template.sql": (tableNode: TableNode, run: boolean) => {
                tableNode.selectSqlTemplate(run);
            },
            "mysql.name.copy": (copyAble: CopyAble) => {
                copyAble.copyName();
            },
            "mysql.data.import": (node: DatabaseNode | ConnectionNode) => {
                vscode.window.showOpenDialog({ filters: { Sql: ['sql'] }, canSelectMany: false, openLabel: "Select sql file to import", canSelectFiles: true, canSelectFolders: false }).then((filePath) => {
                    if (filePath) { node.importData(filePath[0].fsPath); }
                });
            },
            "mysql.data.export": (node: DatabaseNode | TableNode) => {
                serviceManager.dumpService.dump(node, true)
            },
            "mysql.struct.export": (node: DatabaseNode | TableNode) => {
                serviceManager.dumpService.dump(node, false)
            },
            "mysql.template.delete": (tableNode: TableNode) => {
                tableNode.deleteSqlTemplate();
            },
            "mysql.copy.insert": (tableNode: TableNode) => {
                tableNode.insertSqlTemplate();
            },
            "mysql.copy.update": (tableNode: TableNode) => {
                tableNode.updateSqlTemplate();
            },
            "mysql.show.procedure": (procedureNode: ProcedureNode) => {
                procedureNode.showSource();
            },
            "mysql.show.function": (functionNode: FunctionNode) => {
                functionNode.showSource();
            },
            "mysql.show.trigger": (triggerNode: TriggerNode) => {
                triggerNode.showSource();
            },
            "mysql.user.sql": (userNode: UserNode) => {
                userNode.selectSqlTemplate();
            },
            "mysql.template.table": (tableGroup: TableGroup) => {
                tableGroup.createTemplate();
            },
            "mysql.template.procedure": (procedureGroup: ProcedureGroup) => {
                procedureGroup.createTemplate();
            },
            "mysql.template.view": (viewGroup: ViewGroup) => {
                viewGroup.createTemplate();
            },
            "mysql.template.trigger": (triggerGroup: TriggerGroup) => {
                triggerGroup.createTemplate();
            },
            "mysql.template.function": (functionGroup: FunctionGroup) => {
                functionGroup.createTemplate();
            },
            "mysql.template.user": (userGroup: UserGroup) => {
                userGroup.createTemplate();
            },
            "mysql.delete.user": (userNode: UserNode) => {
                userNode.drop();
            },
            "mysql.delete.view": (viewNode: ViewNode) => {
                viewNode.drop();
            },
            "mysql.delete.procedure": (procedureNode: ProcedureNode) => {
                procedureNode.drop();
            },
            "mysql.delete.function": (functionNode: FunctionNode) => {
                functionNode.drop();
            },
            "mysql.delete.trigger": (triggerNode: TriggerNode) => {
                triggerNode.drop();
            },
            "mysql.change.user": (userNode: UserNode) => {
                userNode.changePasswordTemplate();
            },
            "mysql.user.grant": (userNode: UserNode) => {
                userNode.grandTemplate();
            },
        }),

    );

}

export function deactivate() {
}

function initCommand(commandDefinition: any): vscode.Disposable[] {

    const dispose = []

    for (const command in commandDefinition) {
        if (commandDefinition.hasOwnProperty(command)) {
            dispose.push(vscode.commands.registerCommand(command, (...args: any[]) => {
                try {
                    commandDefinition[command](...args)
                } catch (err) {
                    Console.log(err)
                }
            }))
        }
    }

    return dispose;
}

// refrences
// - when : https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts