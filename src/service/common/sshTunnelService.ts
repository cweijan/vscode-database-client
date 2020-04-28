import tunnel = require('tunnel-ssh')
import * as getPort from 'get-port'
import { Node } from '../../model/interface/node';
import { Console } from '../../common/outputChannel';
import { existsSync } from 'fs';

export class SSHTunnelService {

    private tunelMark: { [key: string]: any } = {};

    public closeTunnel(connectId: string) {
        if (this.tunelMark[connectId]) {
            this.tunelMark[connectId].close()
            delete this.tunelMark[connectId]
        }
    }

    public createTunnel(connectionNode: Node, errorCallback: (error) => void): Promise<Node> {
        return new Promise(async (resolve) => {
            const ssh = connectionNode.ssh
            if (!connectionNode.ssh.tunnelPort) {
                connectionNode.ssh.tunnelPort = await getPort({ port: 10567 })
            }
            const port = connectionNode.ssh.tunnelPort;
            const key = connectionNode.getConnectId();
            if (this.tunelMark[key]) {
                resolve({ ...connectionNode, port } as Node)
                return;
            }
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
                this.tunelMark[key] = localTunnel
                if (error && errorCallback) {
                    delete this.tunelMark[key]
                    errorCallback(error)
                }
                resolve({ ...connectionNode, port } as Node)
            });
            localTunnel.on('error', (err) => {
                Console.log('Ssh tunel occur eror : ' + err);
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