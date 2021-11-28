import { DatabaseType } from '@/common/constants';
import { existsSync } from 'fs';
import * as portfinder from 'portfinder';
import { Node } from '../../../model/interface/node';
import { SSHTunnel } from './sshTunnel';

interface TunnelState {
    tunnel: any;
    created?: boolean;
    tunnelPort: number;
    pendings: Pending[]
}

interface Pending {
    resolve: (value: Node) => void;
    reject: (reason?: any) => void;
}

export class SSHTunnelService {

    private tunelMark: { [key: string]: TunnelState } = {};

    public closeTunnel(connectId: string) {
        if (this.tunelMark[connectId]) {
            this.tunelMark[connectId].tunnel.close()
            delete this.tunelMark[connectId]
        }
    }

    public createTunnel(node: Node): Promise<Node> {
        return new Promise(async (resolve, reject) => {
            const ssh = node.ssh
            const key = node.key;
            const tunnelState = this.tunelMark[key];
            if (tunnelState) {
                if (tunnelState.created) {
                    resolve({ ...node, host: "127.0.0.1", port: this.tunelMark[key].tunnelPort } as Node)
                } else {
                    tunnelState.pendings.push({ resolve, reject })
                }
                return;
            }
            const port = await portfinder.getPortPromise({ port: 13322 });
            node.ssh.tunnelPort = port
            const config = {
                username: ssh.username,
                password: ssh.type == 'password' ? ssh.password : null,
                host: ssh.host,
                port: ssh.port,
                dstHost: node.host,
                dstPort: node.port,
                localHost: '127.0.0.1',
                localPort: port,
                algorithms: ssh.algorithms,
                passphrase: ssh.passphrase,
                privateKey: (() => {
                    if (ssh.type == "privateKey" && ssh.privateKeyPath && existsSync(ssh.privateKeyPath)) {
                        return require('fs').readFileSync(ssh.privateKeyPath)
                    }
                    return null
                })()
            };

            this.adapterES(node, config);

            const sshTunnel = new SSHTunnel(config)
            this.tunelMark[key] = { tunnel: sshTunnel, tunnelPort: port, pendings: [{ resolve, reject }] }
            sshTunnel.on("success", () => {
                this.tunelMark[key].created = true;
                for (const pending of this.tunelMark[key].pendings) {
                    pending.resolve({ ...node, host: "127.0.0.1", port } as Node)
                }
            }).on("error", (error) => {
                delete this.tunelMark[key]
                for (const pending of this.tunelMark[key].pendings) {
                    pending.reject(error)
                }
            }).start()
        })
    }

    private adapterES(node: Node, config: any) {
        if (node.dbType == DatabaseType.ES) {
            let url = node.host;
            url = url.replace(/^(http|https):\/\//i, '')
            if (url.includes(":")) {
                const split = url.split(":");
                config.dstHost = split[0]
                const portStr = split[1]?.match(/^\d+/)[0]
                config.dstPort = parseInt(portStr)
                node.esUrl = node.host.replace(config.dstHost, '127.0.0.1').replace(config.dstPort, config.localPort)
            } else {
                config.dstHost = url.split("/")[0]
                config.dstPort = '80'
                node.esUrl = node.host.replace(config.dstHost, '127.0.0.1')
            }
        }
    }

}