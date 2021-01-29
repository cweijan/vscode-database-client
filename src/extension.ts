"use strict";

import * as vscode from "vscode";
import { CommandKey } from "./common/constants";
import { ConnectionNode } from "./model/database/connectionNode";
import { SchemaNode } from "./model/database/databaseNode";
import { UserGroup } from "./model/database/userGroup";
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
import { Console } from "./common/Console";
// Don't change last order, it will occur circular reference
import { ServiceManager } from "./service/serviceManager";
import { QueryUnit } from "./service/queryUnit";
import { FileManager } from "./common/filesManager";
import { ConnectionManager } from "./service/connectionManager";
import { DiagramNode } from "./model/diagram/diagramNode";
import { DiagramGroup } from "./model/diagram/diagramGroup";
import { QueryNode } from "./model/query/queryNode";
import { QueryGroup } from "./model/query/queryGroup";
import { Node } from "./model/interface/node";
import { DbTreeDataProvider } from "./provider/treeDataProvider";
import { UserNode } from "./model/database/userNode";
import { EsConnectionNode } from "./model/es/model/esConnectionNode";
import { ESIndexNode } from "./model/es/model/esIndexNode";
import { activeEs } from "./model/es/provider/main";
import { RedisConnectionNode } from "./model/redis/redisConnectionNode";
import KeyNode from "./model/redis/keyNode";
import { DiffService } from "./service/diff/diffService";
import { DatabaseCache } from "./service/common/databaseCache";

export function activate(context: vscode.ExtensionContext) {

    const serviceManager = new ServiceManager(context)

    activeEs(context)


    ConnectionNode.init()
    context.subscriptions.push(
        ...serviceManager.init(),
        vscode.window.onDidChangeActiveTextEditor((e) => {
            const fileNode = ConnectionManager.getByActiveFile()
            if (fileNode) {
                ConnectionManager.changeActive(fileNode)
            }
        }),

        ...initCommand({
            // util
            ...{
                [CommandKey.Refresh]: async (node: Node) => {
                    if (node) {
                        await node.getChildren(true)
                    } else {
                        DatabaseCache.clearCache()
                    }
                    DbTreeDataProvider.refresh(node)
                },
                [CommandKey.RecordHistory]: (sql: string, costTime: number) => {
                    serviceManager.historyService.recordHistory(sql, costTime);
                },
                "mysql.history.open": () => serviceManager.historyService.showHistory(),
                "mysql.setting.open": () => {
                    serviceManager.settingService.open();
                },
                "mysql.server.info": (connectionNode: ConnectionNode) => {
                    serviceManager.statusService.show(connectionNode)
                },
                "mysql.name.copy": (copyAble: CopyAble) => {
                    copyAble.copyName();
                },
            },
            // connection
            ...{
                "mysql.connection.add": () => {
                    serviceManager.connectService.openConnect(serviceManager.provider)
                },
                "mysql.connection.edit": (connectionNode: ConnectionNode) => {
                    serviceManager.connectService.openConnect(connectionNode.provider, connectionNode)
                },
                "mysql.connection.open": (connectionNode: ConnectionNode) => {
                    connectionNode.provider.openConnection(connectionNode)
                },
                "mysql.connection.disable": (connectionNode: ConnectionNode) => {
                    connectionNode.provider.disableConnection(connectionNode)
                },
                "mysql.connection.delete": (connectionNode: ConnectionNode) => {
                    connectionNode.deleteConnection(context);
                },
                "mysql.host.copy": (connectionNode: ConnectionNode) => {
                    connectionNode.copyName();
                },
            },
            // externel data
            ...{
                "mysql.struct.diff": () => {
                    new DiffService().startDiff(serviceManager.provider);
                },
                "mysql.data.export": (node: SchemaNode | TableNode) => {
                    serviceManager.dumpService.dump(node, true)
                },
                "mysql.struct.export": (node: SchemaNode | TableNode) => {
                    serviceManager.dumpService.dump(node, false)
                },
                "mysql.data.import": (node: SchemaNode | ConnectionNode) => {
                    vscode.window.showOpenDialog({ filters: { Sql: ['sql'] }, canSelectMany: false, openLabel: "Select sql file to import", canSelectFiles: true, canSelectFolders: false }).then((filePath) => {
                        if (filePath) {
                            ServiceManager.getImportService(node.dbType).importSql(filePath[0].fsPath, node)
                        }
                    });
                },
            },
            // database
            ...{
                "mysql.db.active": () => {
                    serviceManager.provider.activeDb();
                },
                "mysql.db.truncate": (databaseNode: SchemaNode) => {
                    databaseNode.truncateDb();
                },
                "mysql.database.add": (connectionNode: ConnectionNode) => {
                    connectionNode.createDatabase();
                },
                "mysql.db.drop": (databaseNode: SchemaNode) => {
                    databaseNode.dropDatatabase();
                },
                "mysql.db.overview": (databaseNode: SchemaNode) => {
                    databaseNode.openOverview();
                },
            },
            // mock
            ...{
                "mysql.mock.table": (tableNode: TableNode) => {
                    serviceManager.mockRunner.create(tableNode)
                },
                "mysql.mock.run": () => {
                    serviceManager.mockRunner.runMock()
                },
            },
            // user node
            ...{
                "mysql.change.user": (userNode: UserNode) => {
                    userNode.changePasswordTemplate();
                },
                "mysql.user.grant": (userNode: UserNode) => {
                    userNode.grandTemplate();
                },
                "mysql.user.sql": (userNode: UserNode) => {
                    userNode.selectSqlTemplate();
                },
            },
            // diagram node
            ...{
                "mysql.diagram.add": (diagramNode: DiagramGroup) => {
                    diagramNode.openAdd()
                },
                "mysql.diagram.open": (node: DiagramNode) => {
                    node.open()
                },
                "mysql.diagram.drop": (node: DiagramNode) => {
                    node.drop()
                },
            },
            // query node
            ...{
                "mysql.runQuery": (sql) => {
                    if (typeof sql != 'string') { sql = null; }
                    QueryUnit.runQuery(sql,ConnectionManager.getLastConnectionOption());
                },
                "mysql.query.switch": async (databaseOrConnectionNode: SchemaNode | ConnectionNode | EsConnectionNode | ESIndexNode) => {
                    if (databaseOrConnectionNode) {
                        await databaseOrConnectionNode.newQuery();
                    } else {
                        vscode.workspace.openTextDocument({ language: 'sql' }).then(async (doc) => {
                            vscode.window.showTextDocument(doc)
                        });
                    }
                },
                "mysql.query.open": (queryNode: QueryNode) => {
                    queryNode.open()
                },
                "mysql.query.add": (queryGroup: QueryGroup) => {
                    queryGroup.add();
                },
                "mysql.query.rename": (queryNode: QueryNode) => {
                    queryNode.rename()
                },
                "mysql.count.sql": (tableNode: TableNode) => {
                    tableNode.countSql()
                },
            },
            // redis
            ...{
                "mysql.redis.connection.status": (connectionNode: RedisConnectionNode) => connectionNode.showStatus(),
                "mysql.redis.connection.terminal": (connectionNode: RedisConnectionNode) => connectionNode.openTerminal(),
                "mysql.redis.key.detail": (keyNode: KeyNode) => keyNode.detail(),
                "mysql.redis.key.del": (keyNode: KeyNode) => keyNode.delete(),
            },
            // table node
            ...{
                "mysql.show.esIndex": (indexNode: ESIndexNode) => {
                    indexNode.viewData()
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
                "mysql.table.show": (tableNode: TableNode) => {
                    if (tableNode) { tableNode.openInNew(); }
                },
            },
            // column node
            ...{
                "mysql.column.up": (columnNode: ColumnNode) => {
                    columnNode.moveUp();
                },
                "mysql.column.down": (columnNode: ColumnNode) => {
                    columnNode.moveDown();
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
            },
            // template
            ...{
                "mysql.table.find": (tableNode: TableNode) => {
                    tableNode.openTable();
                },
                "mysql.codeLens.run": (sql: string) => {
                    QueryUnit.runQuery(sql,ConnectionManager.getLastConnectionOption())
                },
                "mysql.table.design": (tableNode: TableNode) => {
                    tableNode.designTable();
                },
            },
            // show source
            ...{
                "mysql.show.procedure": (procedureNode: ProcedureNode) => {
                    procedureNode.showSource();
                },
                "mysql.show.function": (functionNode: FunctionNode) => {
                    functionNode.showSource();
                },
                "mysql.show.trigger": (triggerNode: TriggerNode) => {
                    triggerNode.showSource();
                },
            },
            // create template
            ...{
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
            },
            // drop template
            ...{
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
            },
        }),

    );

}

export function deactivate() {
}

function commandWrapper(commandDefinition: any, command: string): (...args: any[]) => any {
    return (...args: any[]) => {
        try {
            commandDefinition[command](...args);
        }
        catch (err) {
            Console.log(err);
        }
    };
}

function initCommand(commandDefinition: any): vscode.Disposable[] {

    const dispose = []

    for (const command in commandDefinition) {
        if (commandDefinition.hasOwnProperty(command)) {
            dispose.push(vscode.commands.registerCommand(command, commandWrapper(commandDefinition, command)))
        }
    }

    return dispose;
}


// refrences
// - when : https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts