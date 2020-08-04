import * as path from "path";
import { Constants, ModelType, Template } from "../../common/constants";
import { ConnectionManager } from "../../service/connectionManager";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { InfoNode } from "../other/infoNode";
import { Node } from "../interface/node";
import { DiagramNode } from "./diagramNode";
import { ViewManager } from "../../view/viewManager";
import { TableNode } from "../main/tableNode";
import { ColumnNode } from "../other/columnNode";

export class DiagramGroup extends Node {
    public openAdd() {
        ViewManager.createWebviewPanel({
            path: "diagram", title: "diagram",
            splitView: false, eventHandler:  (handler) => {
                handler.on("init",async () => {
                    handler.emit('load', await this.getData())
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
        return []
    }


    public async getData() {
        var colors = {
            red: "#be4b15",
            green: "#52ce60",
            blue: "#6ea5f8",
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
                        color: colors[columnNode.type] ? colors[columnNode.column.simpleType] : '#be4b15'
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
