import { existsSync, readdirSync } from "fs";
import * as path from "path";
import { Constants, ModelType } from "../../common/constants";
import { FileManager, FileModel } from "../../common/filesManager";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ViewManager } from "../../view/viewManager";
import { Node } from "../interface/node";
import { TableNode } from "../main/tableNode";
import { ColumnNode } from "../other/columnNode";
import { DiagramNode } from "./diagramNode";
import { Global } from "../../common/global";

export class DiagramGroup extends Node {
    public openAdd() {
        ViewManager.createWebviewPanel({
            path: "diagram", title: "diagram",
            iconPath: Global.getExtPath("resources", "icon", "diagram.svg"),
            splitView: false, eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit('route', 'diagram')
                }).on("diagram", async () => {
                    handler.emit('load', { content: await this.getData() })
                }).on("save", ({ name, data }) => {
                    const diagramPath = `diagram/${this.getConnectId()}_${this.database}/${name}.json`;
                    FileManager.record(diagramPath, data, FileModel.WRITE)
                    DbTreeDataProvider.refresh()
                })
            }
        })
    }

    public contextValue = ModelType.DIAGRAM_GROUP;
    public iconPath = path.join(Constants.RES_PATH, "icon/diagram.svg")
    constructor(readonly info: Node) {
        super("DIAGRAM")
        this.id = `${this.getConnectId()}_${info.database}_${ModelType.DIAGRAM_GROUP}`;
        this.init(info)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        const path = `${FileManager.storagePath}/diagram/${this.getConnectId()}_${this.database}`;
        if (!existsSync(path)) {
            return []
        }
        return readdirSync(path).map(fileName => new DiagramNode(fileName.replace(/\.[^/.]+$/, ""), this))
    }


    public async getData() {
        var colors = {
            red: "#be4b15",
            green: "#52ce60",
            int: "#6ea5f8",
            lightred: "#fd8852",
            lightblue: "#afd4fe",
            lightgreen: "#b9e986",
            pink: "#faadc1",
            purple: "#d689ff",
            orange: "#fdb400"
        };
        const nodeDataArray = await Promise.all(DatabaseCache.getTableListOfDatabase(`${this.getConnectId()}_${this.database}`).map(async (node: TableNode) => {
            return {
                key: node.table,
                items: (await node.getChildren()).map((columnNode: ColumnNode) => {
                    return {
                        name: `${columnNode.column.name} : ${columnNode.type}`,
                        iskey: columnNode.isPrimaryKey,
                        figure: "Decision",
                        color: colors[columnNode.column.simpleType] ? colors[columnNode.column.simpleType] : '#be4b15'
                    }
                })
            }
        }))
        return {
            copiesArrays: true,
            copiesArrayObjects: true,
            linkDataArray: [],
            nodeDataArray

        };
    }

}
