import { readFileSync, unlinkSync } from "fs";
import * as path from "path";
import { Constants, ModelType } from "../../common/constants";
import { FileManager, FileModel } from "../../common/filesManager";
import { Global } from "../../common/global";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ViewManager } from "../../common/viewManager";
import { Node } from "../interface/node";

export class DiagramNode extends Node {

    public contextValue: string = ModelType.DIAGRAM;
    public iconPath = path.join(Constants.RES_PATH, "icon/diagram-node.svg")
    constructor(public name: string, readonly parent: Node) {
        super(name)
        this.init(parent)
        this.command = {
            command: "mysql.diagram.open",
            title: "Open Diagram",
            arguments: [this, true],
        }
    }

    public open() {
        const content = JSON.parse(readFileSync(this.getFilePath(), 'utf8'));
        ViewManager.createWebviewPanel({
            path: "app", title: "diagram",
            iconPath: Global.getExtPath("resources", "icon", "diagram-node.svg"),
            splitView: false, eventHandler: (handler) => {
                handler.on("init", () => {
                    delete content.class
                    handler.emit('route', 'diagram')
                }).on("route-diagram", () => {
                    handler.emit('load', { content, name: this.name })
                }).on("save", ({ name, data }) => {
                    unlinkSync(this.getFilePath())
                    this.name = name
                    const diagramPath = `diagram/${this.getConnectId({withSchema:true})}/${name}.json`;
                    FileManager.record(diagramPath, data, FileModel.WRITE)
                    DbTreeDataProvider.refresh(this.parent)
                })
            }
        })
    }


    private getFilePath(): string {
        return `${FileManager.storagePath}/diagram/${this.getConnectId({withSchema:true})}/${this.name}.json`;
    }

    public async getChildren(): Promise<Node[]> {
        return [];
    }

    public drop() {

        Util.confirm(`Are you want to drop diagram ${this.name} ?`, async () => {
            unlinkSync(this.getFilePath())
            DbTreeDataProvider.refresh(this.parent)
        })

    }

}
