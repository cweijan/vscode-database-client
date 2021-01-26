import { NodeUtil } from "@/model/nodeUtil";
import { Global } from "../../common/global";
import { Node } from "../../model/interface/node";
import { ViewManager } from "../../common/viewManager";

export class OverviewService {

    public openOverview(node: Node) {
        const trimNode=NodeUtil.removeParent(node);
        ViewManager.createWebviewPanel({
            path: "app", splitView: false, title: "overview", singlePage: true,
            iconPath: Global.getExtPath("resources", "icon", "overview.svg"),
            eventHandler: async (handler) => {
                handler.on("init", () => {
                    handler.emit("route", 'overview')
                }).on("route-overview", async () => {
                    handler.emit("overview-data", {
                        ...trimNode,
                        infos: await node.execute(`select table_name, table_comment, auto_increment, create_time, update_time, engine, table_rows, data_length, index_length, table_collation, row_format from information_schema.TABLES where TABLE_SCHEMA = '${node.database}' and table_type = 'BASE TABLE'`)
                    })
                })
            }
        })
    }

}