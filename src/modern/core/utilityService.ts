import { createHash, randomInt, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

export interface ComputedUtilityValue {
  readonly md5: string;
  readonly sha1: string;
  readonly sha256: string;
  readonly base64Encode: string;
  readonly base64Decode: string;
  readonly prettyBytes: string;
  readonly urlEncode: string;
  readonly urlDecode: string;
}

export interface RandomUtilityValue {
  readonly uuid: string;
  readonly username: string;
  readonly password: string;
}

export interface SystemProcess {
  readonly pid: number;
  readonly ppid?: number;
  readonly name: string;
  readonly user: string;
  readonly cpu: string;
  readonly memory: string;
  readonly runtime: string;
  readonly command: string;
}

export interface SystemProcessSnapshot {
  readonly platform: NodeJS.Platform;
  readonly currentUser: string;
  readonly selfPid: number;
  readonly rows: readonly SystemProcess[];
}

function hash(algorithm: "md5" | "sha1" | "sha256", value: string): string {
  return createHash(algorithm).update(value, "utf8").digest("hex");
}

export function prettyBytes(value: unknown): string {
  if (value == null) return "";
  let bytes = Number(value);
  if (!Number.isFinite(bytes)) {
    bytes = Number.parseInt(String(value), 10);
  }
  if (!Number.isFinite(bytes)) return String(value);
  const negative = bytes < 0;
  if (negative) bytes = -bytes;
  const units = ["B", "K", "M", "G", "T", "P", "E", "Z", "Y"];
  if (bytes < 1) return `${negative ? "-" : ""}${bytes} ${units[0]}`;
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const scaled = Number((bytes / 1024 ** exponent).toPrecision(3));
  return `${negative ? "-" : ""}${scaled}${units[exponent]}`;
}

export function computeUtilityValue(value: string): ComputedUtilityValue {
  let urlDecode = "";
  try {
    urlDecode = decodeURIComponent(value);
  } catch {
    urlDecode = "Invalid URL encoding";
  }
  return {
    md5: hash("md5", value),
    sha1: hash("sha1", value),
    sha256: hash("sha256", value),
    base64Encode: Buffer.from(value, "utf8").toString("base64"),
    base64Decode: Buffer.from(value, "base64").toString("utf8"),
    prettyBytes: prettyBytes(value),
    urlEncode: encodeURIComponent(value),
    urlDecode,
  };
}

function randomText(length: number, alphabet: string): string {
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export function createRandomUtilityValue(): RandomUtilityValue {
  const usernameAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const passwordAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  return {
    uuid: randomUUID(),
    username: `user_${randomText(10, usernameAlphabet)}`,
    password: randomText(12, passwordAlphabet),
  };
}

function formatMemory(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function executableName(command: string): string {
  const value = command.trim();
  if (!value) return "";
  return (value.split(/\s+/)[0] || "").replace(/^.*[\\/]/, "") || value.slice(0, 48);
}

function parsePosixProcesses(output: string): SystemProcess[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): SystemProcess | undefined => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(.+)$/);
      if (!match) return undefined;
      const [, pid, ppid, user, cpu, rss, runtime, command] = match;
      return {
        pid: Number(pid),
        ppid: Number(ppid),
        name: executableName(command),
        user,
        cpu: cpu ? `${cpu}%` : "-",
        memory: formatMemory(Number(rss) * 1024),
        runtime,
        command,
      };
    })
    .filter((process): process is SystemProcess => Boolean(process));
}

function parseCsvRow(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function parseWindowsProcesses(output: string): SystemProcess[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): SystemProcess | undefined => {
      const columns = parseCsvRow(line);
      if (columns.length < 5) return undefined;
      const pid = Number(columns[1].replace(/[^\d]/g, ""));
      if (!pid) return undefined;
      return {
        pid,
        name: columns[0],
        user: "",
        cpu: "-",
        memory: columns[4].replace(/\s+/g, " ").trim() || "-",
        runtime: "-",
        command: columns[0],
      };
    })
    .filter((process): process is SystemProcess => Boolean(process));
}

async function execText(command: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync(command, [...args], {
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
    windowsHide: true,
  });
  return String(result.stdout || "");
}

export async function listSystemProcesses(): Promise<SystemProcessSnapshot> {
  const windows = process.platform === "win32";
  const output = windows
    ? await execText("tasklist", ["/FO", "CSV", "/NH"])
    : await execText("ps", ["-axo", "pid=,ppid=,user=,%cpu=,rss=,etime=,command="]);
  return {
    platform: process.platform,
    currentUser: os.userInfo().username,
    selfPid: process.pid,
    rows: windows ? parseWindowsProcesses(output) : parsePosixProcesses(output),
  };
}

export async function killSystemProcess(pidValue: unknown): Promise<number> {
  const pid = Number(pidValue);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("Invalid process ID");
  if (pid === process.pid) throw new Error("Cannot end the current extension process");
  if (process.platform === "win32") {
    await execText("taskkill", ["/PID", String(pid), "/T", "/F"]);
  } else {
    process.kill(pid, "SIGTERM");
  }
  return pid;
}

export class UtilityService {
  public computeValue(value: string): ComputedUtilityValue {
    return computeUtilityValue(value);
  }

  public randomValue(): RandomUtilityValue {
    return createRandomUtilityValue();
  }

  public listProcesses(): Promise<SystemProcessSnapshot> {
    return listSystemProcesses();
  }

  public killProcess(pid: unknown): Promise<number> {
    return killSystemProcess(pid);
  }
}

export { parseCsvRow, parsePosixProcesses, parseWindowsProcesses };
