import * as portfinder from 'portfinder'
import { Global } from "@/common/global";
import fs from 'fs';
import http from 'http';

export class ResourceServer {

    public static port: number;
    public static resPath: string;

    public static async init(extensionPath: string) {
        this.resPath = extensionPath + "/out/webview/js";
        this.bind()
    }

    public static async bind() {

        if (this.port || !this.resPath) return;

        const resourceRoot = Global.getConfig("resourceRoot");
        if (resourceRoot == "backup" || resourceRoot == "file") return;

        try {
            const port = await portfinder.getPortPromise({port:8828});
            return new Promise((res,rej)=>{
                http.createServer((req, res) => {
                    const path = this.resPath + req.url;
                    res.end((fs.existsSync(path) && fs.statSync(path).isFile()) ? fs.readFileSync(path) : "404")
                }).listen(port, "127.0.0.1",()=>{
                    console.debug(`Start Internal Server, port is ${port}`)
                    this.port = port;
                    res(port)
                })
            })
        } catch (error) {
            Global.updateConfig("resourceRoot","file")
        }

    }

}