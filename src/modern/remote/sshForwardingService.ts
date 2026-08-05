import * as net from "node:net";

import type { Disposable } from "../core/contracts";
import type { SshConnectionOptions, SshService, SshSession } from "./sshService";

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
  readonly server: net.Server;
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
    if (type !== "Local") {
      throw new Error(`${type} SSH forwarding is not implemented by the active source adapter`);
    }
    const localHost = host(definition.localHost, "127.0.0.1");
    const localPort = port(definition.localPort, "Local port");
    const remoteHost = definition.remoteHost.trim();
    if (!remoteHost) throw new Error("Remote host is required");
    const remotePort = port(definition.remotePort, "Remote port");
    const session = await this.ssh.open(options);
    const server = net.createServer((socket) => {
      void session
        .forwardOut("127.0.0.1", 0, remoteHost, remotePort)
        .then((channel) => {
          socket.pipe(channel).pipe(socket);
          channel.once("close", () => socket.destroy());
          socket.once("close", () => {
            const closable = channel as NodeJS.ReadWriteStream & { destroy?: () => void };
            closable.destroy?.();
          });
        })
        .catch(() => socket.destroy());
    });
    try {
      await listen(server, localHost, localPort);
      this.forwards.set(id, { definition, session, server });
    } catch (error) {
      server.close();
      throw error;
    }
  }

  public async stop(id: string | number): Promise<void> {
    const key = String(id);
    const active = this.forwards.get(key);
    if (!active) return;
    this.forwards.delete(key);
    await new Promise<void>((resolve) => {
      active.server.close(() => resolve());
    });
  }

  public isActive(id: string | number | null | undefined): boolean {
    return id != null && this.forwards.has(String(id));
  }

  public activeIds(): readonly string[] {
    return [...this.forwards.keys()];
  }

  public dispose(): void {
    for (const id of this.activeIds()) void this.stop(id);
  }
}
