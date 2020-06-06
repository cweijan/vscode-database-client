import { StatusService } from "./statusService";
import { ConnectionNode } from "../../model/database/connectionNode";
import { ViewManager } from "../viewManager";

export abstract class AbstractStatusService implements StatusService {

    protected abstract onProcessList(connectionNode: ConnectionNode): ProcessListResponse | Promise<ProcessListResponse>;
    protected abstract onDashBoard(connectionNode: ConnectionNode): DashBoardResponse | Promise<DashBoardResponse>;

    public show(connectionNode: ConnectionNode): void | Promise<void> {
        ViewManager.createWebviewPanel({
            path: "status",
            splitView: false, title: "Server Status",
            receiveListener: async (webviewPanel, params) => {
                switch (params.type) {
                    case "processList":
                        const processList = await this.onProcessList(connectionNode)
                        webviewPanel.webview.postMessage({
                            type: "processList",
                            ...processList
                        })
                        break;
                    case "dashBoard":
                        const dashBoard = await this.onDashBoard(connectionNode)
                        webviewPanel.webview.postMessage({
                            type: "dashBoard",
                            ...dashBoard
                        })
                        break;
                }
            }

        })
    }

}

export interface ProcessListResponse {
    fields: string[]
    list: any[]
}

export interface DashBoardItem {
    now: any;
    type: string;
    value: number
}

export interface DashBoardResponse {
    sessions: DashBoardItem[],
    queries: DashBoardItem[],
    traffic: DashBoardItem[],
}
