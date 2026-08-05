import { promises as fs } from "node:fs";

import {
  Client,
  type ClientChannel,
  type ConnectConfig,
  type SFTPWrapper,
} from "@cweijan/ssh2";

import { OperationCancelledError } from "../core/errors";
import type { ConnectionOptions } from "../database/types";

export interface SshConnectionOptions extends ConnectionOptions {
  readonly options?: Record<string, unknown> & {
    readonly privateKeyPath?: string;
    readonly passphrase?: string;
    readonly agent?: string;
    readonly readyTimeout?: number;
  };
}

export interface RemoteEntry {
  readonly name: string;
  readonly path: string;
  readonly kind: "file" | "directory" | "link" | "other";
  readonly size: number;
  readonly modifiedAt?: Date;
}

export interface SshSession {
  readonly id: string;
  readonly options: SshConnectionOptions;
  list(remotePath: string, signal?: AbortSignal): Promise<RemoteEntry[]>;
  readFile(remotePath: string, signal?: AbortSignal): Promise<Buffer>;
  writeFile(remotePath: string, data: Buffer | string, signal?: AbortSignal): Promise<void>;
  rename(oldPath: string, newPath: string, signal?: AbortSignal): Promise<void>;
  upload(localPath: string, remotePath: string, signal?: AbortSignal): Promise<void>;
  download(remotePath: string, localPath: string, signal?: AbortSignal): Promise<void>;
  mkdir(remotePath: string, recursive?: boolean, signal?: AbortSignal): Promise<void>;
  remove(remotePath: string, directory?: boolean, signal?: AbortSignal): Promise<void>;
  exec(command: string, signal?: AbortSignal): Promise<{ stdout: string; stderr: string; code?: number }>;
  shell(signal?: AbortSignal): Promise<ClientChannel>;
  forwardOut(
    sourceHost: string,
    sourcePort: number,
    destinationHost: string,
    destinationPort: number,
    signal?: AbortSignal,
  ): Promise<NodeJS.ReadWriteStream>;
  close(): Promise<void>;
}

function option(options: SshConnectionOptions, key: string): unknown {
  return options.options?.[key];
}

function abortIfNeeded(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) {
    throw new OperationCancelledError(operation);
  }
}

export function buildSshConnectConfig(
  options: SshConnectionOptions,
  privateKey?: Buffer,
): ConnectConfig {
  const configuredAgent = option(options, "agent");
  return {
    host: options.host || "localhost",
    port: options.port || 22,
    username: options.user || "root",
    password: options.password,
    privateKey,
    passphrase: typeof option(options, "passphrase") === "string"
      ? option(options, "passphrase") as string
      : undefined,
    agent: typeof configuredAgent === "string" ? configuredAgent : undefined,
    readyTimeout: typeof option(options, "readyTimeout") === "number"
      ? option(options, "readyTimeout") as number
      : 30_000,
    keepaliveInterval: 10_000,
  };
}

function connectClient(config: ConnectConfig, signal?: AbortSignal): Promise<Client> {
  abortIfNeeded(signal, "Opening SSH connection");
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    const onAbort = () => {
      if (!settled) {
        settled = true;
        client.end();
        reject(new OperationCancelledError("Opening SSH connection"));
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    client.once("ready", () => {
      if (settled) {
        client.end();
        return;
      }
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(client);
    });
    client.once("error", (error) => {
      if (!settled) {
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      }
    });
    client.connect(config);
  });
}

function openSftp(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) {
        reject(error);
      } else {
        resolve(sftp);
      }
    });
  });
}

function joinRemotePath(parent: string, name: string): string {
  if (parent === "/") {
    return `/${name}`;
  }
  return `${parent.replace(/\/$/, "")}/${name}`;
}

function classifyRemoteEntry(longname: string): RemoteEntry["kind"] {
  if (longname.startsWith("d")) return "directory";
  if (longname.startsWith("l")) return "link";
  if (longname.startsWith("-")) return "file";
  return "other";
}

function remoteList(
  sftp: SFTPWrapper,
  remotePath: string,
): Promise<RemoteEntry[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (error, entries) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(
        entries.map((entry) => ({
          name: entry.filename,
          path: joinRemotePath(remotePath, entry.filename),
          kind: classifyRemoteEntry(entry.longname),
          size: entry.attrs.size,
          modifiedAt: entry.attrs.mtime ? new Date(entry.attrs.mtime * 1000) : undefined,
        })),
      );
    });
  });
}

function sftpReadFile(sftp: SFTPWrapper, remotePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    sftp.readFile(remotePath, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function sftpWriteFile(
  sftp: SFTPWrapper,
  remotePath: string,
  data: Buffer | string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.writeFile(remotePath, data, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function sftpRename(
  sftp: SFTPWrapper,
  oldPath: string,
  newPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.rename(oldPath, newPath, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function sftpMkdir(
  sftp: SFTPWrapper,
  remotePath: string,
  recursive: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, { mode: 0o755 }, (error) => {
      if (!error || (recursive && (error as NodeJS.ErrnoException).code === "EEXIST")) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

function sftpRemove(
  sftp: SFTPWrapper,
  remotePath: string,
  directory: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const callback = (error: Error | null | undefined) => {
      if (error) reject(error);
      else resolve();
    };
    if (directory) {
      sftp.rmdir(remotePath, callback);
    } else {
      sftp.unlink(remotePath, callback);
    }
  });
}

function execute(
  client: Client,
  command: string,
): Promise<{ stdout: string; stderr: string; code?: number }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      stream.on("data", (chunk: Buffer | string) => stdout.push(Buffer.from(chunk)));
      stream.stderr.on("data", (chunk: Buffer | string) => stderr.push(Buffer.from(chunk)));
      stream.on("close", (code: number | undefined) => {
        resolve({
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          code,
        });
      });
      stream.on("error", reject);
    });
  });
}

function openShell(client: Client): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    client.shell((error, stream) => {
      if (error) reject(error);
      else resolve(stream);
    });
  });
}

function forwardOut(
  client: Client,
  sourceHost: string,
  sourcePort: number,
  destinationHost: string,
  destinationPort: number,
): Promise<NodeJS.ReadWriteStream> {
  return new Promise((resolve, reject) => {
    client.forwardOut(
      sourceHost,
      sourcePort,
      destinationHost,
      destinationPort,
      (error, stream) => {
        if (error) reject(error);
        else resolve(stream);
      },
    );
  });
}

function sessionFromClient(
  id: string,
  options: SshConnectionOptions,
  client: Client,
  sftp: SFTPWrapper,
): SshSession {
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      client.end();
    }
  };
  return {
    id,
    options,
    async list(remotePath, signal) {
      abortIfNeeded(signal, "List remote files");
      return remoteList(sftp, remotePath);
    },
    async readFile(remotePath, signal) {
      abortIfNeeded(signal, "Read remote file");
      return sftpReadFile(sftp, remotePath);
    },
    async writeFile(remotePath, data, signal) {
      abortIfNeeded(signal, "Write remote file");
      await sftpWriteFile(sftp, remotePath, data);
    },
    async rename(oldPath, newPath, signal) {
      abortIfNeeded(signal, "Rename remote path");
      await sftpRename(sftp, oldPath, newPath);
    },
    async upload(localPath, remotePath, signal) {
      abortIfNeeded(signal, "Upload remote file");
      await fs.access(localPath);
      await new Promise<void>((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    async download(remotePath, localPath, signal) {
      abortIfNeeded(signal, "Download remote file");
      await new Promise<void>((resolve, reject) => {
        sftp.fastGet(remotePath, localPath, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    async mkdir(remotePath, recursive = false, signal) {
      abortIfNeeded(signal, "Create remote directory");
      await sftpMkdir(sftp, remotePath, recursive);
    },
    async remove(remotePath, directory = false, signal) {
      abortIfNeeded(signal, "Remove remote path");
      await sftpRemove(sftp, remotePath, directory);
    },
    async exec(command, signal) {
      abortIfNeeded(signal, "Execute remote command");
      return execute(client, command);
    },
    async shell(signal) {
      abortIfNeeded(signal, "Open SSH terminal");
      return openShell(client);
    },
    async forwardOut(sourceHost, sourcePort, destinationHost, destinationPort, signal) {
      abortIfNeeded(signal, "Forward SSH port");
      return forwardOut(client, sourceHost, sourcePort, destinationHost, destinationPort);
    },
    close,
  };
}

export class SshService {
  private readonly sessions = new Map<string, Promise<SshSession>>();

  public async open(
    options: SshConnectionOptions,
    signal?: AbortSignal,
  ): Promise<SshSession> {
    const existing = this.sessions.get(options.id);
    if (existing) {
      return existing;
    }
    const pending = this.create(options, signal);
    this.sessions.set(options.id, pending);
    try {
      return await pending;
    } catch (error) {
      this.sessions.delete(options.id);
      throw error;
    }
  }

  public async close(id: string): Promise<void> {
    const pending = this.sessions.get(id);
    this.sessions.delete(id);
    const session = await pending;
    await session?.close();
  }

  public async dispose(): Promise<void> {
    const ids = [...this.sessions.keys()];
    await Promise.all(ids.map((id) => this.close(id)));
  }

  private async create(
    options: SshConnectionOptions,
    signal?: AbortSignal,
  ): Promise<SshSession> {
    const privateKeyPath = option(options, "privateKeyPath");
    const privateKey = typeof privateKeyPath === "string"
      ? await fs.readFile(privateKeyPath)
      : undefined;
    const client = await connectClient(buildSshConnectConfig(options, privateKey), signal);
    try {
      const sftp = await openSftp(client);
      return sessionFromClient(options.id, options, client, sftp);
    } catch (error) {
      client.end();
      throw error;
    }
  }
}
