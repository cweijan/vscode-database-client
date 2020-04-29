import { FieldInfo } from "mysql";
import { Console } from "../../../common/outputChannel";
import { ConnectionNode } from "../../../model/database/connectionNode";
import { ViewManager } from "../../../view/viewManager";
import { ConnectionManager } from "../../connectionManager";
import { StatusService } from "../statusService";

export class MysqlStatusService implements StatusService {

    public async show(connectionNode: ConnectionNode): Promise<void> {

        const connection = await ConnectionManager.getConnection(connectionNode)

        connection.query('show processlist', (err, rows, fields: FieldInfo[]) => {
            if (err) {
                Console.log(err);
            } else {
                ViewManager.createWebviewPanel({
                    path: "pages/status/index",
                    splitView: true, title: "Server Status",
                    initListener: (webviewPanel) => {
                        webviewPanel.webview.postMessage({
                            type: "processList",
                            fields: fields.map((field) => field.name),
                            list: rows
                        })
                    },
                    receiveListener: (webviewPanel, params) => {
                        switch (params.type) {
                            case "processList":
                                this.show(connectionNode)
                                break;
                        }
                    }

                })
            }

        })

    }

}