import { readdirSync } from "fs";
import * as path from "path";
import { Constants, ModelType } from "../../common/constants";
import { FileManager, FileModel } from "../../common/filesManager";
import { Global } from "../../common/global";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ViewManager } from "../../common/viewManager";
import { Node } from "../interface/node";
import { TableGroup } from "../main/tableGroup";
import { TableNode } from "../main/tableNode";
import { ColumnNode } from "../other/columnNode";
import { InfoNode } from "../other/infoNode";
import { DiagramNode } from "./diagramNode";

export class DiagramGroup extends Node {

    public contextValue = ModelType.DIAGRAM_GROUP;
    public iconPath = path.join(Constants.RES_PATH, "icon/diagram.svg")
    constructor(readonly parent: Node) {
        super("DIAGRAM")
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        const path = `${FileManager.storagePath}/diagram/${this.getConnectId({ withSchema: true })}`;
        const diagrams = this.readdir(path)?.map(fileName => new DiagramNode(fileName.replace(/\.[^/.]+$/, ""), this));
        if (!diagrams || diagrams.length == 0) {
            return [new InfoNode("This schema has no created diagram.")]
        }
        return diagrams
    }

    readdir(path: string): string[] {
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
                    const diagramPath = `diagram/${this.getConnectId({ withSchema: true })}/${name}.json`;
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

        return await Promise.all((await new TableGroup(this.parent).getChildren() as TableNode[]).map(async (node: TableNode) => {
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



