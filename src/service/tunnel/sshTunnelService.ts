import tunnel = require('./tunnel-ssh')
import { Node } from '../../model/interface/node';
import { Console } from '../../common/Console';
import { existsSync } from 'fs';
import * as portfinder from 'portfinder'
import { DatabaseType } from '@/common/constants';
import { spawn } from "child_process";

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

            this.adapterES(node, config);

            if (ssh.type == 'native') {
                let args = ['-TnNL', `${port}:${config.dstHost}:${config.dstPort}`, config.host, '-p', `${config.port}`];
                if (ssh.privateKeyPath) {
                    args.push('-i', ssh.privateKeyPath)
                }
                const bat = spawn('ssh', args);
                const successHandler = setTimeout(() => {
                    resolve({ ...node, host: "127.0.0.1", port } as Node)
                }, ssh.watingTime);
                bat.stderr.on('data', (chunk) => {
                    if (chunk?.toString().match(/^[@\s]+$/)) return;
                    delete this.tunelMark[key]
                    errorCallback(new Error(chunk.toString()?.replace(/@/g, '')))
                    clearTimeout(successHandler)
                });
                bat.on('close', (code, signal) => {
                    delete this.tunelMark[key]
                });
                return;
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

    private adapterES(node: Node, config: any) {
        if (node.dbType == DatabaseType.ES) {
            const split = node.host.split(":");
            let splitIndex = split[0]?.match(/^(http|https):/) ? 1 : 0;
            config.dstHost = split[splitIndex]
            config.dstPort = parseInt(split[++splitIndex] || '80')
        }
    }

}