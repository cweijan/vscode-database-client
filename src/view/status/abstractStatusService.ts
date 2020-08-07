import { StatusService } from "./statusService";
import { ConnectionNode } from "../../model/database/connectionNode";
import { ViewManager } from "../viewManager";
import { Global } from "../../common/global";

export abstract class AbstractStatusService implements StatusService {

    protected abstract onProcessList(connectionNode: ConnectionNode): ProcessListResponse | Promise<ProcessListResponse>;
    protected abstract onDashBoard(connectionNode: ConnectionNode): DashBoardResponse | Promise<DashBoardResponse>;

    public show(connectionNode: ConnectionNode): void | Promise<void> {
        ViewManager.createWebviewPanel({
            path: "app",
            splitView: false, title: "Server Status",
            iconPath: Global.getExtPath("resources", "icon", "state.svg"),
            eventHandler: (handler) => {
                handler.on("init",()=>{
                    handler.emit('route', 'status')
                })
                .on("processList", async () => {
                    const processList = await this.onProcessList(connectionNode)
                    handler.emit("processList", { ...processList })
                }).on("dashBoard", async () => {
                    const dashBoard = await this.onDashBoard(connectionNode)
                    handler.emit("dashBoard", { ...dashBoard })
                })
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
