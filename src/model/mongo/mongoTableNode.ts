import { ModelType } from "@/common/constants";
import { TableMeta } from "@/common/typeDef";
import { MongoConnection } from "@/service/connect/mongoConnection";
import { ConnectionManager } from "@/service/connectionManager";
import { MongoClient } from "mongodb";
import { TreeItemCollapsibleState } from "vscode";
import { TableNode } from "../main/tableNode";

export class MongoTableNode extends TableNode {
    contextValue = ModelType.TABLE_GROUP;
    collapsibleState=TreeItemCollapsibleState.None;
    public async getChildren() {
        const client = await this.getClient()

        const tables = await client.db(this.database).listCollections().toArray()

        const tableNodes = tables.map<TableNode>((table) => {
            const mongoNode:TableNode = new MongoTableNode({ name: table.name } as TableMeta, this);
            mongoNode.schema=mongoNode.database
            return mongoNode;
        });


        return tableNodes;
    }


    public async getClient(): Promise<MongoClient> {
        const redis = (await ConnectionManager.getConnection(this)) as MongoConnection
        return new Promise(res => { redis.run(res) })
    }


}