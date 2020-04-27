import { ConnectionManager } from "../../connectionManager";
import { AbstractConnectService } from "../abstractConnectService";
import { Node } from "../../../model/interface/node";

export class MysqlConnectService extends AbstractConnectService {
    protected async connect(connectionNode: Node): Promise<void> {
        await ConnectionManager.getConnection(connectionNode)
    }

}