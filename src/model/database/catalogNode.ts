import * as path from "path";
import { Constants, ModelType } from "../../common/constants";
import { FileManager } from '../../common/filesManager';
import { Util } from '../../common/util';
import { ConnectionManager } from "../../service/connectionManager";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";

export class CatalogNode extends Node implements CopyAble {


    public contextValue: string = ModelType.CATALOG;
    public iconPath: string = path.join(Constants.RES_PATH, "icon/database.svg");
    constructor(public database: string, readonly parent: Node) {
        super(database)
        this.init(this.parent)
        this.cacheSelf()
        const lcp = ConnectionManager.getLastConnectionOption(false);
        if (lcp && lcp.getConnectId() == this.getConnectId() && (lcp.database == this.database)) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/database-active.svg");
            this.description = `Active`
        }
    }

    public getChildren(): Promise<Node[]> | Node[] {
        return this.parent.getChildren.apply(this)
    }

    public async newQuery() {

        FileManager.show(`${this.uid}.sql`)

    }

    public copyName() {
        Util.copyToBoard(this.schema)
    }

}
