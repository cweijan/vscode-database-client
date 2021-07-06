import tunnel = require('./tunnel-ssh')
import { Node } from '../../model/interface/node';
import { Console } from '../../common/Console';
import { existsSync } from 'fs';
import * as portfinder from 'portfinder'
import { DatabaseType } from '@/common/constants';

export class SSHTunnelService {

    private tunelMark: { [key: string]: { tunnel: any, tunnelPort: number } } = {};

    public closeTunnel(connectId: string) {
        if (this.tunelMark[connectId]) {
            this.tunelMark[connectId].tunnel.close()
            delete this.tunelMark[connectId]
        }
    }

    public createTunnel(node: Node, errorCallback: (error) => void): Promise<Node> {
        return new Promise(async (resolve, reject) => {
            const ssh = node.ssh
            const key = node.getConnectId();
            if (this.tunelMark[key]) {
                resolve({ ...node, host: "127.0.0.1", port: this.tunelMark[key].tunnelPort } as Node)
                return;
            }
            const port = await portfinder.getPortPromise();
            node.ssh.tunnelPort = port
            const config = {
                username: ssh.username,
                password: ssh.password,
                host: ssh.host,
                port: ssh.port,
                dstHost: node.host,
                dstPort: node.port,
                localHost: '127.0.0.1',
                localPort: port,
                algorithms: ssh.algorithms,
                passphrase: ssh.passphrase,
                privateKey: (() => {
                    if (ssh.privateKeyPath && existsSync(ssh.privateKeyPath)) {
                        return require('fs').readFileSync(ssh.privateKeyPath)
                    }
                    return null
                })()
            };
            if (node.dbType == DatabaseType.ES) {
                config.dstHost = node.host.split(":")[0]
                // config.dstPort= (node.host.split(":")[1] || '80') as any
                const portStr = node.host.split(":")[1] || '80'
                config.dstPort = parseInt(portStr)
            }

            const localTunnel = tunnel(config, (error, server) => {
                this.tunelMark[key] = { tunnel: localTunnel, tunnelPort: port }
                if (error && errorCallback) {
                    delete this.tunelMark[key]
                    errorCallback(error)
                }
                resolve({ ...node, host: "127.0.0.1", port } as Node)
            });
            localTunnel.on('error', (err) => {
                Console.log('Ssh tunel occur error : ' + err);
                if (err && errorCallback) {
                    localTunnel.close()
                    delete this.tunelMark[key]
                    errorCallback(err)
                }
                resolve(null)
            });
        })
    }

}