import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions } from "../database/types";
import { connectionOption, sshConnectionNamespace } from "../database/connectionOptions";
import { launchRdp } from "./rdpService";
import type { SshConnectionOptions } from "./sshService";
import { connectionTreeIcon } from "../tree/targetTreeIcon";

export interface RdpStoredConnection extends ConnectionOptions {
  readonly name?: string;
  readonly disabled?: boolean;
  readonly [key: string]: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function port(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

function displayName(connection: RdpStoredConnection): string {
  if (connection.name) return connection.name;
  const host = text(connection.host, "localhost");
  return `${host}@${port(connection.port, 3389)}`;
}

function sshOptions(connection: RdpStoredConnection): SshConnectionOptions {
  const options = connection.options || {};
  const ssh = sshConnectionNamespace(connection);
  const sshOptions = {
    ...options,
    type: text(ssh.type, "auto"),
    authType: text(ssh.authType, "") || undefined,
    agent: text(ssh.agent, "") || undefined,
    privateKeyPath: text(ssh.privateKeyPath ?? connectionOption(connection, "privateKeyPath"), "") || undefined,
    passphrase: text(ssh.passphrase ?? connectionOption(connection, "passphrase"), "") || undefined,
    readyTimeout: port(ssh.waitingTime ?? connectionOption(connection, "readyTimeout"), 30_000),
  };
  return {
    ...connection,
    id: `${connection.id}:rdp-ssh`,
    type: "SSH",
    host: text(ssh.host, text(connection.host, "localhost")),
    port: port(ssh.port, 22),
    user: text(ssh.username ?? ssh.user, text(connection.user, "root")),
    password: text(ssh.password, connection.password || "") || undefined,
    options: sshOptions,
  };
}

function usesSsh(connection: RdpStoredConnection): boolean {
  const options = connection.options || {};
  return connection.usingSSH === true || options.usingSSH === true;
}

export class RdpConnectionNode extends vscode.TreeItem {
  public constructor(
    public readonly connection: RdpStoredConnection,
    private readonly services: ExtensionServices,
    private readonly onDelete: (id: string) => Promise<void>,
    public readonly parent?: vscode.TreeItem,
  ) {
    super(displayName(connection), vscode.TreeItemCollapsibleState.None);
    this.contextValue = "rdpConnection";
    this.tooltip = `${text(connection.host, "localhost")}:${port(connection.port, 3389)}`;
    this.iconPath = connectionTreeIcon(
      this.services.resources,
      connection,
      this.services.activeConnection.get(),
    );
  }

  public async startRdp(): Promise<void> {
    if (this.connection.disabled) {
      throw new Error(`RDP connection ${displayName(this.connection)} is disabled`);
    }
    const forwardId = `rdp:${this.connection.id}`;
    let endpoint = {
      host: text(this.connection.host, "localhost"),
      port: port(this.connection.port, 3389),
    };
    let forwarded = false;
    try {
      if (usesSsh(this.connection)) {
        const remoteHost = endpoint.host;
        await this.services.forwarding.start(
          sshOptions(this.connection),
          {
            id: forwardId,
            type: "Local",
            localHost: "127.0.0.1",
            localPort: 0,
            remoteHost,
            remotePort: endpoint.port,
          },
        );
        const localPort = this.services.forwarding.activePort(forwardId);
        if (!localPort) throw new Error("SSH tunnel did not expose a local RDP port");
        endpoint = { host: "127.0.0.1", port: localPort };
        forwarded = true;
      }
      const launch = await launchRdp(this.connection, endpoint);
      launch.process.once("error", (error) => {
        void vscode.window.showErrorMessage(
          `Unable to open RDP session for ${displayName(this.connection)}: ${error.message}`,
        );
      });
      if (forwarded) {
        const stop = () => {
          void this.services.forwarding.stop(forwardId);
        };
        launch.process.once("close", stop);
        launch.process.once("error", stop);
      }
      void vscode.window.showInformationMessage(`Opening RDP session for ${displayName(this.connection)}.`);
    } catch (error) {
      if (forwarded) await this.services.forwarding.stop(forwardId).catch(() => undefined);
      throw error;
    }
  }

  public openConnection(): Promise<void> {
    return this.startRdp();
  }

  public async deleteConnection(): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
      `Delete connection ${displayName(this.connection)}?`,
      { modal: true },
      "Confirm",
    );
    if (confirmed === "Confirm") await this.onDelete(this.connection.id);
  }

  public async copy(): Promise<void> {
    await vscode.env.clipboard.writeText(displayName(this.connection));
  }

  public async copyKey(): Promise<void> {
    await vscode.env.clipboard.writeText(this.connection.host || "");
  }

  public selectDB(): Promise<void> {
    return this.startRdp();
  }
}
