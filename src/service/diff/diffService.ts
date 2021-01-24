import { Global } from "@/common/global";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";
import { ViewManager } from "@/view/viewManager";

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