import { FieldInfo } from "mysql";
import { Console } from "../../../common/outputChannel";
import { ConnectionNode } from "../../../model/database/connectionNode";
import { ConnectionManager } from "../../../service/connectionManager";
import { AbstractStatusService, DashBoardResponse, ProcessListResponse } from "../abstractStatusService";
import { QueryUnit } from "../../../service/queryUnit";
import format = require('date-format');

export class MysqlStatusService extends AbstractStatusService {

    protected async onProcessList(connectionNode: ConnectionNode): Promise<ProcessListResponse> {
        const connection = await ConnectionManager.getConnection(connectionNode)
        return new Promise((resovle, rej) => {
            connection.query('show processlist', (err, rows, fields: FieldInfo[]) => {
                if (err) {
                    Console.log(err);
                    rej(err)
                } else {
                    resovle({
                        fields: fields.map((field) => field.name),
                        list: rows
                    })
                }
            })
        })
    }

    protected async onDashBoard(connectionNode: ConnectionNode): Promise<DashBoardResponse> {

        const connection = await ConnectionManager.getConnection(connectionNode)
        const now = format('MM:ss', new Date())

        // session
        const result = (await QueryUnit.queryPromise(connection, "show global status like '%threads%'")) as any[]
        let count: number;
        let running: number;
        for (const row of result) {
            if (row['Variable_name'] == 'Threads_connected') {
                count = row['Value'] as number
            }
            if (row['Variable_name'] == 'Threads_running') {
                running = row['Value'] as number
            }
        }

        return {
            session: [{now, type: 'count', value: count }, {now, type: 'running', value: running }, { now, type: 'sleep', value: count - running }]
        };
    }

}