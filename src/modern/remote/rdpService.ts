import { promises as fs } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";

import type { ConnectionOptions } from "../database/types";

export interface RdpEndpoint {
  readonly host: string;
  readonly port: number;
}

export interface RdpLaunch {
  readonly filePath: string;
  readonly process: ChildProcess;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function configuredRdp(connection: ConnectionOptions): Record<string, unknown> {
  const source = connection as ConnectionOptions & { rdpConfig?: unknown };
  return record(source.rdpConfig ?? connection.options?.rdpConfig);
}

function booleanOption(
  options: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  return typeof options[key] === "boolean" ? options[key] as boolean : fallback;
}

function numberOption(
  options: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = options[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function rdpHost(value: string): string {
  const normalized = value.trim();
  if (normalized.startsWith("[") && normalized.includes("]")) {
    return normalized.slice(1, normalized.indexOf("]"));
  }
  return normalized.replace(/:\d+$/, "");
}

function credentialHost(value: string): string {
  return rdpHost(value).replace(/:.*/, "");
}

export function buildRdpFileContent(
  connection: ConnectionOptions,
  endpoint: RdpEndpoint,
): string {
  const options = configuredRdp(connection);
  const lines = [
    `full address:s:${endpoint.host}:${endpoint.port}`,
    `screen mode id:i:${booleanOption(options, "fullScreen", true) ? 2 : 1}`,
    `keyboardhook:i:${booleanOption(options, "forwardComposition", true) ? 1 : 0}`,
    `authentication level:i:${booleanOption(options, "showAuthWarning", false) ? 1 : 0}`,
    `redirectcomports:i:${booleanOption(options, "redirectComports", true) ? 1 : 0}`,
    `smart sizing:i:${booleanOption(options, "smartSizing", true) ? 1 : 0}`,
  ];
  if (booleanOption(options, "redirectDrives", true)) {
    lines.push("drivestoredirect:s:*");
  }
  const height = numberOption(options, "height");
  const width = numberOption(options, "width");
  if (height !== undefined) lines.push(`desktopheight:i:${height}`);
  if (width !== undefined) lines.push(`desktopwidth:i:${width}`);
  return `${lines.join("\n")}\n`;
}

function configureWindowsCredential(connection: ConnectionOptions, host: string): void {
  if (process.platform !== "win32") return;
  const target = `TERMSRV/${credentialHost(host)}`;
  spawnSync("cmdkey.exe", ["/delete:" + target], {
    stdio: "ignore",
    windowsHide: true,
  });
  if (!connection.user || !connection.password) return;
  spawnSync("cmdkey.exe", [
    "/generic:" + target,
    "/user:" + connection.user,
    "/pass:" + connection.password,
  ], {
    stdio: "ignore",
    windowsHide: true,
  });
}

export async function launchRdp(
  connection: ConnectionOptions,
  endpoint: RdpEndpoint,
): Promise<RdpLaunch> {
  if (process.platform !== "win32") {
    throw new Error("RDP connections require Windows Remote Desktop (mstsc.exe)");
  }
  const filePath = path.join(os.tmpdir(), "dbclient.rdp");
  await fs.writeFile(filePath, buildRdpFileContent(connection, endpoint), "utf8");
  configureWindowsCredential(connection, endpoint.host);
  const child = spawn("mstsc.exe", [filePath, "/admin"], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  return { filePath, process: child };
}
