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
import { InfoNode } from "../other/infoNode";

export class DiagramGroup extends Node {

    public contextValue = ModelType.DIAGRAM_GROUP;
    public iconPath = path.join(Constants.RES_PATH, "icon/diagram.svg")
    constructor(readonly parent: Node) {
        super("DIAGRAM")
        this.uid = `${this.getConnectId()}_${parent.database}_${ModelType.DIAGRAM_GROUP}`;
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        const path = `${FileManager.storagePath}/diagram/${this.getConnectId()}_${this.database}`;
        const diagrams = this.readdir(path)?.map(fileName => new DiagramNode(fileName.replace(/\.[^/.]+$/, ""), this));
        if (!diagrams || diagrams.length == 0) {
            return [new InfoNode("This database has no created diagram.")]
        }
        return diagrams
    }

    readdir(path:string):string[]{
        try {
            return readdirSync(path)
        } catch (error) {
            return null;
        }
    }

    public openAdd() {
        ViewManager.createWebviewPanel({
            path: "app", title: "new",
            iconPath: Global.getExtPath("resources", "icon", "diagram.svg"),
            splitView: false, eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit('route', 'selector')
                }).on("route-selector", async () => {
                    handler.emit("selector-load", await this.getTableInfos())
                }).on("save", ({ name, data }) => {
                    const diagramPath = `diagram/${this.getConnectId()}_${this.database}/${name}.json`;
                    FileManager.record(diagramPath, data, FileModel.WRITE)
                    DbTreeDataProvider.refresh(this)
                })
            }
        })
    }

    public async getData() {
        const nodeDataArray = await this.getTableInfos()
        return {
            copiesArrays: true,
            copiesArrayObjects: true,
            linkDataArray: [],
            nodeDataArray

        };
    }


    public async getTableInfos() {
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
        return await Promise.all(DatabaseCache.getTableListOfDatabase(`${this.getConnectId()}_${this.database}`).map(async (node: TableNode) => {
            return {
                key: node.table,
                items: (await node.getChildren()).map((columnNode: ColumnNode) => {
                    return {
                        name: `${columnNode.column.name} : ${columnNode.type}`,
                        iskey: columnNode.isPrimaryKey,
                        figure: "Decision",
                        color: colors[columnNode.column.simpleType] ? colors[columnNode.column.simpleType] : '#be4b15'
                    };
                })
            };
        }));
    }

}



