import { existsSync, readFileSync } from 'fs';
import * as Mock from 'mockjs';
import * as vscode from "vscode";
import { MessageType } from "../../common/Constants";
import { ConnectionManager } from "../../database/ConnectionManager";
import { DatabaseCache } from "../../database/DatabaseCache";
import { QueryUnit } from "../../database/QueryUnit";
import { ColumnNode } from "../../model/other/columnNode";
import { TableNode } from '../../model/main/tableNode';
import { QueryPage } from "../../view/result/query";
import { MessageResponse } from "../../view/result/queryResponse";
import { FileManager, FileModel } from '../../common/FileManager';
import { MockModel } from './mockModel';
import { Node } from '../../model/interface/node';

export class MockRunner {

    private readonly MOCK_INDEX = "$mockIndex";

    public async create(tableNode: TableNode) {
        const columnList = (await tableNode.getChildren()) as ColumnNode[]
        const mockModel: MockModel = {
            host: tableNode.host, port: tableNode.port, user: tableNode.user, database: tableNode.database, table: tableNode.table,
            mockStartIndex: tableNode.primaryKey ? 'auto' : 1
            , mockCount: 50, mock: {}, examples: "http://mockjs.com/examples.html#DPD"
        }
        for (const columnNode of columnList) {
            mockModel.mock[columnNode.column.name] = {
                type: columnNode.column.simpleType,
                value: this.getValueByType(columnNode.column)
            }
        }

        const mockPath = `mock/${tableNode.database}/${tableNode.table}/mock.json`;
        const mockFullPath = `${FileManager.storagePath}/${mockPath}`;
        if (existsSync(mockFullPath)) {
            const existsMockModel = JSON.parse(readFileSync(mockFullPath, 'utf8')) as MockModel;
            if (Object.keys(existsMockModel.mock).length != columnList.length) {
                existsMockModel.mock = mockModel.mock
                await FileManager.record(mockPath, JSON.stringify(existsMockModel, null, 4), FileModel.WRITE);
            }

        } else {
            await FileManager.record(mockPath, JSON.stringify(mockModel, null, 4), FileModel.WRITE);
        }
        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(mockFullPath)
        );
    }

    public async runMock() {

        const content = vscode.window.activeTextEditor.document.getText()

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

        const insertSqlTemplate = (await tableNode.insertSqlTemplate(false)).replace("\n", " ");
        const sqlList = [];
        const mockData = mockModel.mock;
        const { mockStartIndex, mockCount } = mockModel
        let startIndex = 1;
        if (mockStartIndex != null) {
            if (!isNaN(Number(mockStartIndex))) {
                startIndex = mockStartIndex as number
            } else if (mockStartIndex.toString().toLowerCase() == "auto") {
                startIndex = (await tableNode.getMaxPrimary()) + 1;
            }

            for (let i = startIndex; i < (startIndex + mockCount); i++) {
                let tempInsertSql = insertSqlTemplate;
                for (const column in mockData) {
                    let value = mockData[column].value;
                    if (value && (typeof value == "string")) { value = value.replace(/^'|'$/g, "\\'") }
                    if (value == this.MOCK_INDEX) { value = i; }
                    tempInsertSql = tempInsertSql.replace(new RegExp("\\$+" + column + "(,|\\s)", 'ig'), this.wrapQuote(mockData[column].type, Mock.mock(value)) + "$1");
                }
                sqlList.push(tempInsertSql)
            }

            const connection = await ConnectionManager.getConnection({ ...mockModel, getConnectId: () => `${mockModel.host}_${mockModel.port}_${mockModel.user}` } as any as Node)

            const success = await QueryUnit.runBatch(connection, sqlList)
            vscode.commands.executeCommand("mysql.template.sql", tableNode, true)
            QueryPage.send({ type: MessageType.MESSAGE, res: { message: `Generate mock data for ${tableNode.table} ${success ? 'success' : 'fail'}!`, success } as MessageResponse });

        }
    }

    private wrapQuote(type: string, value: any): any {
        type = type.toLowerCase()
        switch (type) {
            case "varchar": case "char": case "date": case "time": case "timestamp": case "datetime": case "set": case "json":
                return `'${value}'`
            default:
                if (type.indexOf("text") != -1 || type.indexOf("blob") != -1) { return `'${value}'` }
        }
        return value;
    }



    // refrence : http://mockjs.com/examples.html
    private getValueByType(column: any): string {
        const type = column.simpleType.toLowerCase()
        const match = column.type.match(/.+?\((\d+)\)/);
        let length = 1024
        if (match) {
            length = 1 << (match[1] - 1)
        }
        if (column.key == "PRI") {
            return this.MOCK_INDEX;
        }
        // console.log(type)
        switch (type) {
            case "bit":
                return "@integer(0," + length + ")";
            case "char":
                return "@character('lower')";
            case "text":
                return "@sentence()"
            case "varchar":
                return "@string('lower',5)"
            // return "@cword(5)"
            case "tinyint":
                return "@integer(0," + length + ")";
            case "smallint":
                return "@integer(0," + length + ")";
            case "double": case "float":
                return "@float(0,100,2,2)"
            case "date":
                return "@date()"
            case "time":
                return "@time()"
            case "timestamp": case "datetime":
                return "@datetime()"
        }
        return "@integer(1," + length + ")";
    }

}