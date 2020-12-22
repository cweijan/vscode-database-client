import { readFileSync, unlink, unlinkSync } from "fs";
import * as path from "path";
import { TreeItemCollapsibleState } from "vscode";
import { Constants, ModelType } from "../../common/constants";
import { FileManager, FileModel } from "../../common/filesManager";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ViewManager } from "../../view/viewManager";
import { Node } from "../interface/node";
import { Global } from "../../common/global";

export class DiagramNode extends Node {

    public contextValue: string = ModelType.DIAGRAM;
    public iconPath = path.join(Constants.RES_PATH, "icon/diagram-node.svg")
    constructor(public name: string, readonly info: Node) {
        super(name)
        // this.id = `${info.getConnectId()}_${info.database}_diragram_${name}`
        this.init(info)
        this.collapsibleState = TreeItemCollapsibleState.None
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
                    const diagramPath = `diagram/${this.getConnectId()}_${this.database}/${name}.json`;
                    FileManager.record(diagramPath, data, FileModel.WRITE)
                    DbTreeDataProvider.refresh(this.info)
                })
            }
        })
    }


    private getFilePath(): string {
        return `${FileManager.storagePath}/diagram/${this.getConnectId()}_${this.database}/${this.name}.json`;
    }

    public async getChildren(): Promise<Node[]> {
        return [];
    }

    public drop() {

        Util.confirm(`Are you want to drop diagram ${this.name} ?`, async () => {
            unlinkSync(this.getFilePath())
            DbTreeDataProvider.refresh(this.info)
        })

    }

}
