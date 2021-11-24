import { DatabaseType } from '@/common/constants';
import { existsSync } from 'fs';
import * as portfinder from 'portfinder';
import { Node } from '../../../model/interface/node';
import { SSHTunnel } from './sshTunnel';

export class SSHTunnelService {

    private tunelMark: { [key: string]: { tunnel: any, tunnelPort: number } } = {};

    public closeTunnel(connectId: string) {
        if (this.tunelMark[connectId]) {
            this.tunelMark[connectId].tunnel.close()
            delete this.tunelMark[connectId]
        }
    }

    public createTunnel(node: Node): Promise<Node> {
        return new Promise(async (resolve, reject) => {
            const ssh = node.ssh
            const key = node.getConnectId();
            if (this.tunelMark[key]) {
                resolve({ ...node, host: "127.0.0.1", port: this.tunelMark[key].tunnelPort } as Node)
                return;
            }
            const port = await portfinder.getPortPromise({port:13322});
            node.ssh.tunnelPort = port
            const config = {
                username: ssh.username,
                password: ssh.type=='password'?ssh.password:null,
                host: ssh.host,
                port: ssh.port,
                dstHost: node.host,
                dstPort: node.port,
                localHost: '127.0.0.1',
                localPort: port,
                algorithms: ssh.algorithms,
                passphrase: ssh.passphrase,
                privateKey: (() => {
                    if (ssh.type=="privateKey" && ssh.privateKeyPath && existsSync(ssh.privateKeyPath)) {
                        return require('fs').readFileSync(ssh.privateKeyPath)
                    }
                    return null
                })()
            };

            this.adapterES(node, config);

            const sshTunnel = new SSHTunnel(config)
            sshTunnel.on("success", () => {
                this.tunelMark[key] = { tunnel: sshTunnel, tunnelPort: port }
                resolve({ ...node, host: "127.0.0.1", port } as Node)
            }).on("error", (error) => {
                delete this.tunelMark[key]
                reject(error)
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