import { ConnectionManager } from "../../connectionManager";
import { AbstractConnectService } from "../abstractConnectService";
import { Node } from "../../../model/interface/node";

export class MysqlConnectService extends AbstractConnectService {
    protected async connect(connectionNode: Node): Promise<void> {
        const connectId = connectionNode.getConnectId();
        const connection = ConnectionManager.getActiveConnectByKey(connectId)
        if (connection) {
            ConnectionManager.removeConnection(connectId)
        }
        await ConnectionManager.getConnection(connectionNode)
    }

}