import { Console } from "@/common/Console";
import EventEmitter from "events";
import { createServer, Server, Socket } from "net";
import { Client } from "ssh2";
var createConfig = require('./config');

export class SSHTunnel extends EventEmitter {
    private client: Client;
    private adapatServer: Server;

    constructor(private config: any) {
        super()
        this.config = createConfig(config)
    }

    public async start() {
        try {
            await Promise.all([this.createNetAdapter(), this.createSSHConnection()])
            this.emit("success")
        } catch (error) {
            this.error(error)
            this.emit("error", error)
        }

    }

    public close() {
        if (this.adapatServer) {
            this.adapatServer.close()
            this.adapatServer = null;
        }
        if (this.client) {
            this.client.end()
            this.client = null;
        }
    }

    private error(error?: any) {
        // Console.log(error)
        this.close()
    }

    private createNetAdapter() {
        return new Promise((res, rej) => {
            this.adapatServer = createServer((socket) => {
                this.forward(socket)
            })
                .on("error", err => {this.error(err);rej(err)})
                .on("close", () => this.close())
                .listen(this.config.localPort, this.config.localHost, () => {
                    res(null)
                })
        })

    }

    private createSSHConnection() {
        return new Promise((res, rej) => {
            this.client = new Client();
            this.client
                .on("ready", () => {
                    res(this.client)
                })
                .on("error", err => {this.error(err);rej(err)})
                .on("close", () => this.close())
                // .on("close", this.close) 错误示范.. 这样传this对象变了
                .connect(this.config)
        })
    }

    private forward(socket: Socket) {
        const config = this.config;
        /**
         * forwardOut() doesn't actually listen on the local port, so need create net server to forward.
         */
        this.client.forwardOut(config.srcHost, config.srcPort, config.dstHost, config.dstPort, (err, sshStream) => {
            if (err) {
                this.error(err)
                return;
            }
            sshStream.on('error', (error) => {
                this.error(error)
            });
            socket.pipe(sshStream).pipe(socket);
        });
    }

}