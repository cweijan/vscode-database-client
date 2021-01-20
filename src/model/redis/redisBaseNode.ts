import { Node } from "@/model/interface/node";
import { RedisConnection } from "@/service/connect/redisConnection";
import { ConnectionManager } from "@/service/connectionManager";
import { RedisClient } from "redis";

export default abstract class RedisBaseNode extends Node {
    abstract getChildren(): Promise<Node[]>;

    public async getClient(): Promise<RedisClient> {
        const redis = (await ConnectionManager.getConnection(this)) as RedisConnection
        return new Promise(res => { redis.run(res) })
    }

}