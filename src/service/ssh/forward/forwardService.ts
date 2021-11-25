import { exec } from "child_process";
import { ViewManager } from '@/common/viewManager';
import { join } from 'path';
import { Constants } from '@/common/constants';
import { SSHConfig } from '@/model/interface/sshConfig';
import { Util } from '@/common/util';
import { SSHTunnel } from '../tunnel/sshTunnel';
import { window } from "vscode";

export class ForwardInfo {
    id: any;
    name: string;
    localHost: string;
    localPort: number;
    remoteHost: string;
    remotePort: number;
    state: boolean
}

interface TunnelInfo {
    tunnel?: SSHTunnel,
    index: number,
    forwardInfo: ForwardInfo
}

export class ForwardService {

    private tunelMark: { [key: string]: TunnelInfo } = {};
    private store_key = "forward_store"

    public createForwardView(sshConfig: SSHConfig) {
        ViewManager.createWebviewPanel({
            iconPath: join(Constants.RES_PATH, 'ssh/forward.svg'),
            splitView: false, path: "app", title: `forward://${sshConfig.username}@${sshConfig.host}`,
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", 'forward')
                }).on("route-forward", () => {
                    handler.emit("config", sshConfig)
                    handler.emit("forwardList", this.list(sshConfig))
                }).on("save", async info => {
                    if (info.id) {
                        await this.stop(info.id)
                    } else {
                        info.id = new Date().getTime() + "";
                    }
                    this.forward(sshConfig, info)
                        .then(() => handler.emit("success"))
                        .catch(err => handler.emit("error", err))
                }).on("start", async id => {
                    const info = this.tunelMark[id].forwardInfo
                    this.forward(sshConfig, info)
                        .then(() => handler.emit("success"))
                        .catch(err => handler.emit("error", err))
                }).on("stop", async id => {
                    await this.stop(id)
                    handler.emit("success")
                }).on("remove", content => {
                    this.remove(sshConfig, content)
                    handler.emit("success")
                }).on("load", () => {
                    handler.emit("forwardList", this.list(sshConfig))
                }).on("cmd", (content) => {
                    if(process.platform!="win32"){
                        window.showErrorMessage("Only Support Windows system!");
                        return;
                    }
                    exec(`cmd.exe /C start cmd /C ${content}`)
                })
            }
        })
    }


    public list(sshConfig: SSHConfig): ForwardInfo[] {
        return Util.getStore(`${this.store_key}_${sshConfig.host}_${sshConfig.port}`, [])
            .map((forwardInfo, index) => {
                if (!this.tunelMark[forwardInfo.id]) {
                    this.tunelMark[forwardInfo.id] = { forwardInfo, index }
                }
                forwardInfo.state = this.tunelMark[forwardInfo.id].tunnel != null;
                return forwardInfo;
            })
    }

    public save(sshConfig: SSHConfig, forwardInfo: ForwardInfo) {
        const id = forwardInfo.id;
        const storeKey = `${this.store_key}_${sshConfig.host}_${sshConfig.port}`;
        const forwardInfos = Util.getStore(storeKey, [])
        const curForwardInfo = this.tunelMark[id];
        if (curForwardInfo) {
            forwardInfos[curForwardInfo.index] = forwardInfo;
        } else {
            forwardInfos.push(forwardInfo)
            this.tunelMark[id] = { forwardInfo, index: forwardInfos.length }
        }
        Util.store(storeKey, forwardInfos)
    }

    public remove(sshConfig: SSHConfig, id: any) {
        const storeKey = `${this.store_key}_${sshConfig.host}_${sshConfig.port}`;
        const forwardInfos = Util.getStore(storeKey, [])
        this.stop(id)
        forwardInfos.splice(this.tunelMark[id].index, 1)
        Util.store(storeKey, forwardInfos)
    }

    public async stop(id: string): Promise<void> {
        await this.tunelMark[id].tunnel?.close()
        delete this.tunelMark[id]?.tunnel
    }

    public forward(sshConfig: SSHConfig, forwardInfo: ForwardInfo): Promise<void> {
        return new Promise((resolve, reject) => {
            const id = forwardInfo.id;
            const config = {
                ...sshConfig,
                localHost: forwardInfo.localHost,
                localPort: forwardInfo.localPort,
                dstHost: forwardInfo.remoteHost,
                dstPort: forwardInfo.remotePort,
                keepAlive: true,
                privateKey: (() => {
                    if (sshConfig.privateKeyPath) {
                        return require('fs').readFileSync(sshConfig.privateKeyPath)
                    }
                })()
            };
            const tunnel = new SSHTunnel(config)
            tunnel.on("success", () => {
                this.tunelMark[id].tunnel = tunnel
                this.save(sshConfig, forwardInfo)
                resolve();
            }).on("error", (error) => {
                delete this.tunelMark[id]?.tunnel
                reject(error)
            }).start()
        })
    }

}