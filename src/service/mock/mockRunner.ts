import { existsSync, readFileSync } from 'fs';
import * as Mock from 'mockjs';
import * as vscode from "vscode";
import { MessageType } from "../../common/constants";
import { ConnectionManager } from "../connectionManager";
import { DatabaseCache } from "../common/databaseCache";
import { QueryUnit } from "../queryUnit";
import { ColumnNode } from "../../model/other/columnNode";
import { TableNode } from '../../model/main/tableNode';
import { QueryPage } from "../../view/result/query";
import { MessageResponse } from "../../view/result/queryResponse";
import { FileManager, FileModel } from '../../common/filesManager';
import { MockModel } from './mockModel';
import { Node } from '../../model/interface/node';
import { ColumnMeta } from '../../model/other/columnMeta';

export class MockRunner {

    private readonly MOCK_INDEX = "$mockIndex";
    public static primaryKeyMap: { [key: string]: string } = {}

    public async create(tableNode: TableNode) {
        const columnList = (await tableNode.getChildren()) as ColumnNode[]
        const mockModel: MockModel = {
            mode: tableNode.global === false ? 'workspace' : 'global',
            host: tableNode.getHost(), port: tableNode.getPort(), user: tableNode.getUser(), database: tableNode.database, table: tableNode.table,
            mockStartIndex: MockRunner.primaryKeyMap[tableNode.getConnectId()] ? 'auto' : 1
            , mockCount: 50, examples: "http://mockjs.com/examples.html#DPD", mock: {}
        }
        for (const columnNode of columnList) {
            mockModel.mock[columnNode.column.name] = {
                type: columnNode.column.simpleType,
                value: this.getMockValue(columnNode.column)
            }
        }

        const mockPath = `mock/${tableNode.database}/${tableNode.table}/mock.json`;
        const mockFullPath = `${FileManager.storagePath}/${mockPath}`;
        let targetModel = mockModel;

        try {
            if (existsSync(mockFullPath)) {
                const existsMockModel = JSON.parse(readFileSync(mockFullPath, 'utf8')) as MockModel;
                if (Object.keys(existsMockModel.mock).length != columnList.length) {
                    existsMockModel.mock = mockModel.mock
                }
                targetModel = existsMockModel
            }
        } catch (err) { }

        await FileManager.record(mockPath, JSON.stringify(targetModel, null, 4), FileModel.WRITE);
        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(mockFullPath)
        );
    }

    public async runMock() {

        const content = vscode.window.activeTextEditor.document.getText()

        const mockModel = JSON.parse(content) as MockModel;
        if(!mockModel.mode){
            mockModel.mode='global'
        }
        const databaseid = `${mockModel.mode}_${mockModel.host}_${mockModel.port}_${mockModel.user}_${mockModel.database}`;
        const tableList = DatabaseCache.getChildListOfDatabase(databaseid) as TableNode[]
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

            const connection = await ConnectionManager.getConnection({ ...tableNode } as any as Node)

            const success = await QueryUnit.runBatch(connection, sqlList)
            vscode.commands.executeCommand("mysql.template.sql", tableNode, true)
            QueryPage.send({ connection:tableNode,type: MessageType.MESSAGE, res: { message: `Generate mock data for ${tableNode.table} ${success ? 'success' : 'fail'}!`, success } as MessageResponse });

        }
    }

    private wrapQuote(type: string, value: any): any {
        type = type.toLowerCase()
        switch (type) {
            case "varchar": case "char": case "date": case "time": case "timestamp": case "datetime": case "set": case "json":
                return `'${value}'`
            default:
                if (type.indexOf("text") != -1 || type.indexOf("blob") != -1 || type.indexOf("binary") != -1) { return `'${value}'` }
        }
        return value;
    }

    // refrence : http://mockjs.com/examples.html
    private getMockValue(column: ColumnMeta): string {

        const valueByName = this.getValueByName(column.name)
        if (valueByName) {
            return valueByName;
        }

        return this.getValueByType(column);
    }
    private getValueByName(name: string) {

        name = name.toLowerCase()
        if (name == "create_time" || name == "created_time" || name == "update_time" || name == "updated_time") {
            return "@now('yyyy-MM-dd HH:mm:ss')"
        }

        if (name == "created_by" || name == "updated_by") {
            return "vscode-mysql-mock"
        }

        if (name == "revision" || name == "version") {
            return "1"
        }

        return null;
    }

    private getValueByType(column: ColumnMeta): string {
        const type = column.simpleType.toLowerCase()
        const numericMatch = column.type.match(/.+?\((\d+)\)/);
        let length = 1024
        if (numericMatch) {
            length = 1 << (parseInt(numericMatch[1]) - 1)
        }
        if (column.isPrimary) {
            return this.MOCK_INDEX;
        }
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