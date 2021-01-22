import { ModelType } from "@/common/constants";
import { MongoConnection } from "@/service/connect/mongoConnection";
import { ConnectionManager } from "@/service/connectionManager";
import { MongoClient } from "mongodb";
import { TableNode } from "../main/tableNode";

export class MongoTableNode extends TableNode {
    contextValue = ModelType.TABLE_GROUP;



    public async getChildren() {

        return [];
    }


    public async selectSqlTemplate() {
        const client = await this.getClient()
        const result=await client.db(this.database).collection(this.label).find({}).toArray()
        console.log(result)
    }

    public async getClient(): Promise<MongoClient> {
        const redis = (await ConnectionManager.getConnection(this)) as MongoConnection
        return new Promise(res => { redis.run(res) })
    }


}