import { Global } from "@/common/global";
import { TableGroup } from "@/model/main/tableGroup";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";
import { ViewManager } from "@/view/viewManager";
import { DatabaseCache } from "../common/databaseCache";

export class DiffService {
    startDiff(provider: DbTreeDataProvider) {

        ViewManager.createWebviewPanel({
            path: "app", title: "Struct Sync",
            splitView: false, iconPath: Global.getExtPath("resources", "icon", "add.svg"),
            eventHandler: (handler => {
                handler.on("init", () => {
                    handler.emit('route', 'structDiff')
                }).on("route-structDiff", async () => {
                    const nodes = (await provider.getConnectionNodes())
                    let databaseList = {}
                    for (const node of nodes) {
                        databaseList[node.label] = await node.getChildren()
                    }
                    handler.emit('structDiff-data', { nodes, databaseList })
                }).on("start", (opt) => {
                    const from=DatabaseCache.getChildListOfId(`${opt.from.connection}_${opt.from.database}#TABLE`)
                    const to=DatabaseCache.getChildListOfId(`${opt.to.connection}_${opt.to.database}#TABLE`)
                    console.log(from)
                }).on("execute", async sql => {
                    try {
                        // await this.execute(sql)
                        handler.emit("success")
                    } catch (error) {
                        handler.emit("error", error.message)
                    }
                })
            })
        })


    }

}