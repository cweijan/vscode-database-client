import { FTPConnection } from "@/service/connect/ftpConnection";
import { ConnectionManager } from "@/service/connectionManager";
import * as Client from '@/model/ftp/lib/connection'
import { Node } from "../interface/node";

export class FtpBaseNode extends Node {

    constructor(label: string) {
        super(label)
    }

    public async getClient(): Promise<Client> {
        const ftpConnection = await ConnectionManager.getConnection(this.parent) as FTPConnection
        return ftpConnection.getClient()
    }

}