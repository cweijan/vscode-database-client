import { Node } from "@/model/interface/node";

export class ConnnetionConfig {
    database: { [key: string]: Node };
    nosql: { [key: string]: Node };
}