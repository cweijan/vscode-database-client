import * as vscode from "vscode";
import format = require('date-format');
import { TableNode } from '../../model/table/tableNode';
import { MockModel } from './mockModel';
import { FileManager, FileModel } from '../FileManager';
import { ColumnNode } from "../../model/table/columnNode";
import { readFileSync } from "fs";
import { ConnectionManager } from "../../database/ConnectionManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import * as Mock from 'mockjs'
import { QueryUnit } from "../../database/QueryUnit";
import { QueryPage } from "../../view/result/query";
import { MessageResponse } from "../../view/result/queryResponse";
import { MessageType } from "../../common/Constants";

export class MockRunner {

    public async create(tableNode: TableNode) {
        const mockModel: MockModel = {
            host: tableNode.host, port: tableNode.port, user: tableNode.user, database: tableNode.database, table: tableNode.table,
            mockStartIndex: 0, mockCount: 50, mock: {}
        }
        const columnList = (await tableNode.getChildren()) as ColumnNode[]
        for (const column of columnList) {

            mockModel.mock[column.column.name] = this.getValueByType(column.column.simpleType)
        }

        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(await FileManager.record("mock.json", JSON.stringify(mockModel, null, 4), FileModel.WRITE))
        );
    }

    public async runMock(fileUri: vscode.Uri) {
        const content = readFileSync(fileUri.fsPath, 'utf8')

        const mockModel = JSON.parse(content) as MockModel;
        const databaseid = `${mockModel.host}_${mockModel.port}_${mockModel.user}_${mockModel.database}`;
        const tableList = DatabaseCache.getTableListOfDatabase(databaseid) as TableNode[]
        if (!tableList) {
            vscode.window.showErrorMessage(`Database ${mockModel.database} not found!`)
            return;
        }
        let tableNode: TableNode;
        for (const table of tableList) {
            if (table.table == mockModel.table) {
                tableNode = table
            }
        }
        if (!tableNode) {
            vscode.window.showErrorMessage(`Table ${mockModel.table} not found!`)
            return;
        }

        const insertSqlTemplate = await tableNode.insertSqlTemplate(false)
        const sqlList = [];
        const mockData = mockModel.mock;
        const { mockStartIndex, mockCount } = mockModel
        for (let i = mockStartIndex; i < (mockStartIndex + mockCount); i++) {
            let tempInsertSql = insertSqlTemplate;
            for (const column in mockData) {
                if (mockData.hasOwnProperty(column)) {
                    tempInsertSql = tempInsertSql.replace(new RegExp("\\$+" + column, 'i'), `'${Mock.mock(mockData[column])}'`);
                }
            }
            sqlList.push(tempInsertSql)
        }

        const connection = await ConnectionManager.getConnection({ ...mockModel })
        const success = await QueryUnit.runBatch(connection, sqlList)
        QueryPage.send({ type: MessageType.MESSAGE, res: { message: `Generate mock data for ${tableNode.table} ${success ? 'success' : 'fail'}!`, success } as MessageResponse });

    }

    private getValueByType(type: string): string {
        type = type.toLowerCase()
        // console.log(type)
        switch (type) {
            case "bit":
                return "@integer(0,1)";
            case "char":
                return "@character('lower')";
            case "varchar":
                return "@cword(5)"
            case "date":
                return "@date()"
            case "double": case "float":
                return "@float(30,80)"
            case "time":
                return "@time()"
            case "timestamp": case "datetime":
                return "@datetime()"
        }
        return "@integer(1,1000)";
    }

}