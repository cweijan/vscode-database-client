import tunnel = require('tunnel-ssh')
import { Node } from '../../model/interface/node';
import { Console } from '../../common/outputChannel';
import { existsSync } from 'fs';
import * as portfinder from 'portfinder'

export class SSHTunnelService {

    private tunelMark: { [key: string]: { tunnel: any, tunnelPort: number } } = {};

    public closeTunnel(connectId: string) {
        if (this.tunelMark[connectId]) {
            this.tunelMark[connectId].tunnel.close()
            delete this.tunelMark[connectId]
        }
    }

    public createTunnel(connectionNode: Node, errorCallback: (error) => void): Promise<Node> {
        return new Promise(async (resolve) => {
            const ssh = connectionNode.ssh
            const key = connectionNode.getConnectId();
            if (this.tunelMark[key]) {
                resolve({ ...connectionNode, port: this.tunelMark[key].tunnelPort } as Node)
                return;
            }
            const port = await portfinder.getPortPromise();
            connectionNode.ssh.tunnelPort = port
            const config = {
                username: ssh.username,
                password: ssh.password,
                host: ssh.host,
                port: ssh.port,
                dstHost: connectionNode.host,
                dstPort: connectionNode.port,
                localHost: '127.0.0.1',
                localPort: port,
                passphrase: ssh.passphrase,
                privateKey: (() => {
                    if (ssh.privateKeyPath && existsSync(ssh.privateKeyPath)) {
                        return require('fs').readFileSync(ssh.privateKeyPath)
                    }
                    return null
                })()
            };

            const localTunnel = tunnel(config, (error, server) => {
                this.tunelMark[key] = { tunnel: localTunnel, tunnelPort: port }
                if (error && errorCallback) {
                    delete this.tunelMark[key]
                    errorCallback(error)
                }
                resolve({ ...connectionNode, host: "127.0.0.1", port } as Node)
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