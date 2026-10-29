import * as net from "node:net";

import type { Disposable } from "../core/contracts";
import type {
  SshConnectionOptions,
  SshRemoteForward,
  SshService,
  SshSession,
} from "./sshService";

export interface SshForwardDefinition {
  readonly id: string | number;
  readonly type?: SshForwardType;
  readonly localHost?: string;
  readonly localPort: number | string;
  readonly remoteHost: string;
  readonly remotePort: number | string;
}

export type SshForwardType = "Local" | "Remote" | "Dynamic";

interface ActiveForward {
  readonly definition: SshForwardDefinition;
  readonly session: SshSession;
  readonly server?: net.Server;
  readonly remote?: SshRemoteForward;
}

function port(value: number | string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new Error(`${label} must be an integer between 0 and 65535`);
  }
  return parsed;
}

function host(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized || fallback;
}

function listen(server: net.Server, hostName: string, portNumber: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(portNumber, hostName);
  });
}

function closeServer(server: net.Server | undefined): Promise<void> {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(() => resolve()));
}

function destroyStream(stream: NodeJS.ReadWriteStream | undefined): void {
  const closable = stream as NodeJS.ReadWriteStream & { destroy?: () => void } | undefined;
  closable?.destroy?.();
}

function socksResponse(status: number): Buffer {
  return Buffer.from([5, status, 0, 1, 0, 0, 0, 0, 0, 0]);
}

function ipv6Address(value: Buffer): string {
  const groups: string[] = [];
  for (let index = 0; index < 16; index += 2) {
    groups.push(value.readUInt16BE(index).toString(16));
  }
  return groups.join(":");
}

function createSocksServer(
  session: SshSession,
): net.Server {
  return net.createServer((socket) => {
    let stage: "greeting" | "request" | "connecting" = "greeting";
    let buffer = Buffer.alloc(0);
    let channel: NodeJS.ReadWriteStream | undefined;

    const rejectRequest = (status: number): void => {
      if (!socket.destroyed) socket.end(socksResponse(status));
    };
    const onData = (chunk: Buffer | string): void => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      while (stage !== "connecting") {
        if (stage === "greeting") {
          if (buffer.length < 2) return;
          const methodLength = buffer[1];
          if (buffer.length < 2 + methodLength) return;
          const methods = buffer.subarray(2, 2 + methodLength);
          buffer = buffer.subarray(2 + methodLength);
          if (!methods.includes(0)) {
            rejectRequest(255);
            return;
          }
          socket.write(Buffer.from([5, 0]));
          stage = "request";
          continue;
        }
        if (buffer.length < 4) return;
        const version = buffer[0];
        const command = buffer[1];
        const addressType = buffer[3];
        let addressLength = 0;
        if (addressType === 1) addressLength = 4;
        else if (addressType === 4) addressLength = 16;
        else if (addressType === 3) {
          if (buffer.length < 5) return;
          addressLength = 1 + buffer[4];
        } else {
          rejectRequest(8);
          return;
        }
        const requestLength = 4 + addressLength + 2;
        if (buffer.length < requestLength) return;
        const request = buffer.subarray(0, requestLength);
        buffer = buffer.subarray(requestLength);
        if (version !== 5 || command !== 1) {
          rejectRequest(command === 1 ? 1 : 7);
          return;
        }
        const addressOffset = addressType === 3 ? 5 : 4;
        const destinationHost = addressType === 1
          ? [...request.subarray(addressOffset, addressOffset + 4)].join(".")
          : addressType === 4
            ? ipv6Address(request.subarray(addressOffset, addressOffset + 16))
            : request.subarray(addressOffset + 1, addressOffset + addressLength).toString("utf8");
        const destinationPort = request.readUInt16BE(requestLength - 2);
        stage = "connecting";
        socket.pause();
        void session.forwardOut("127.0.0.1", 0, destinationHost, destinationPort)
          .then((nextChannel) => {
            channel = nextChannel;
            socket.removeListener("data", onData);
            socket.write(socksResponse(0));
            if (buffer.length > 0) {
              nextChannel.write(buffer);
              buffer = Buffer.alloc(0);
            }
            socket.pipe(nextChannel).pipe(socket);
            nextChannel.on("close", () => socket.destroy());
            nextChannel.on("error", () => socket.destroy());
          })
          .catch(() => rejectRequest(5));
      }
    };
    socket.on("data", onData);
    socket.on("error", () => destroyStream(channel));
    socket.on("close", () => destroyStream(channel));
  });
}

export class SshForwardingService implements Disposable {
  private readonly forwards = new Map<string, ActiveForward>();

  public constructor(private readonly ssh: SshService) {}

  public async start(
    options: SshConnectionOptions,
    definition: SshForwardDefinition,
  ): Promise<void> {
    const id = String(definition.id);
    if (this.forwards.has(id)) return;
    const type = definition.type ?? "Local";
    if (type !== "Local" && type !== "Remote" && type !== "Dynamic") {
      throw new Error(`Unsupported SSH forwarding type: ${String(type)}`);
    }
    const localHost = host(definition.localHost, "127.0.0.1");
    const localPort = port(definition.localPort, "Local port");
    const remoteHost = definition.remoteHost?.trim();
    if (type !== "Dynamic" && !remoteHost) throw new Error("Remote host is required");
    const remotePort = type === "Dynamic" ? 0 : port(definition.remotePort, "Remote port");
    const session = await this.ssh.open(options);
    let server: net.Server | undefined;
    let remote: SshRemoteForward | undefined;
    try {
      if (type === "Remote") {
        remote = await session.forwardIn(
          remoteHost || "127.0.0.1",
          remotePort,
          (channel) => {
            const socket = net.createConnection({ host: localHost, port: localPort });
            socket.once("connect", () => socket.pipe(channel).pipe(socket));
            socket.once("error", () => destroyStream(channel));
            channel.on("error", () => socket.destroy());
            channel.on("close", () => socket.destroy());
          },
        );
      } else {
        server = type === "Dynamic"
          ? createSocksServer(session)
          : net.createServer((socket) => {
            void session
              .forwardOut("127.0.0.1", 0, remoteHost || "127.0.0.1", remotePort)
              .then((channel) => {
                socket.pipe(channel).pipe(socket);
                channel.once("close", () => socket.destroy());
                socket.once("close", () => destroyStream(channel));
              })
              .catch(() => socket.destroy());
          });
        await listen(server, localHost, localPort);
      }
      this.forwards.set(id, { definition, session, server, remote });
    } catch (error) {
      await remote?.close().catch(() => undefined);
      await closeServer(server);
      await this.releaseSession(session);
      throw error;
    }
  }

  public async stop(id: string | number): Promise<void> {
    const key = String(id);
    const active = this.forwards.get(key);
    if (!active) return;
    this.forwards.delete(key);
    await closeServer(active.server);
    await active.remote?.close();
    await this.releaseSession(active.session);
  }

  public isActive(id: string | number | null | undefined): boolean {
    return id != null && this.forwards.has(String(id));
  }

  public activeIds(): readonly string[] {
    return [...this.forwards.keys()];
  }

  public activePort(id: string | number): number | undefined {
    const active = this.forwards.get(String(id));
    if (active?.remote) return active.remote.port;
    const address = active?.server?.address();
    return typeof address === "object" && address ? address.port : undefined;
  }

  public dispose(): void {
    for (const id of this.activeIds()) void this.stop(id);
  }

  private async releaseSession(session: SshSession): Promise<void> {
    if (!session.id || [...this.forwards.values()].some((active) => active.session.id === session.id)) {
      return;
    }
    await this.ssh.close(session.id);
  }
}
