import type { SshSession } from "./sshService";

export type SshMonitorPlatform = "linux" | "macos" | "windows";

export interface SshMonitorSnapshot {
  readonly cpu: number;
  readonly memory: number;
  readonly memoryUsed: number;
  readonly memoryTotal: number;
  readonly disk: number;
  readonly diskUsed: string;
  readonly diskTotal: string;
  readonly network: {
    readonly received: number;
    readonly sent: number;
  };
}

function fraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function numbers(value: string): number[] {
  return (value.match(/-?\d+(?:\.\d+)?/g) ?? [])
    .map(Number)
    .filter((item) => Number.isFinite(item));
}

function outputNumbers(value: string): number[] {
  return numbers(value.replace(/,/g, ""));
}

function textResult(value: { stdout: string; stderr: string }): string {
  return [value.stdout, value.stderr].filter(Boolean).join("\n").trim();
}

async function execText(session: Pick<SshSession, "exec">, command: string): Promise<string> {
  const result = await session.exec(command);
  const output = textResult(result);
  if (!output) {
    throw new Error(`SSH command returned no output: ${command}`);
  }
  return output;
}

export function detectSshMonitorPlatform(value: string): SshMonitorPlatform {
  const normalized = value.toLowerCase();
  if (normalized.includes("darwin") || normalized.includes("mac os")) return "macos";
  if (normalized.includes("windows") || normalized.includes("microsoft")) return "windows";
  return "linux";
}

export function parseCpuUsage(value: string, platform: SshMonitorPlatform): number {
  if (platform === "windows") {
    const load = outputNumbers(value).find((item) => item >= 0 && item <= 100);
    return fraction((load ?? 0) / 100);
  }
  const idle = value.match(/([\d.]+)\s*%?\s*id(?:le)?/i)?.[1];
  if (idle) return fraction((100 - Number(idle)) / 100);
  const user = value.match(/([\d.]+)\s*%?\s*(?:us|user)/i)?.[1];
  const system = value.match(/([\d.]+)\s*%?\s*(?:sy|sys)/i)?.[1];
  if (user || system) {
    return fraction((Number(user || 0) + Number(system || 0)) / 100);
  }
  return fraction((outputNumbers(value)[0] ?? 0) / 100);
}

export function parseMemoryUsage(
  value: string,
  secondValueIsAvailable: boolean,
): Pick<SshMonitorSnapshot, "memory" | "memoryUsed" | "memoryTotal"> {
  const [total = 0, second = 0] = outputNumbers(value);
  const used = secondValueIsAvailable ? Math.max(0, total - second) : Math.max(0, second);
  return {
    memory: total > 0 ? fraction(used / total) : 0,
    memoryUsed: used,
    memoryTotal: total,
  };
}

export function parseDiskUsage(
  value: string,
  platform: SshMonitorPlatform,
): Pick<SshMonitorSnapshot, "disk" | "diskUsed" | "diskTotal"> {
  const values = outputNumbers(value);
  if (platform === "windows") {
    let total = 0;
    let used = 0;
    for (let index = 0; index + 1 < values.length; index += 2) {
      total += values[index];
      used += values[index + 1];
    }
    return {
      disk: total > 0 ? fraction(used / total) : 0,
      diskUsed: String(used),
      diskTotal: String(total),
    };
  }
  const [total = 0, used = 0] = values;
  const percent = value.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
  return {
    disk: percent == null ? (total > 0 ? fraction(used / total) : 0) : fraction(Number(percent) / 100),
    diskUsed: String(used),
    diskTotal: String(total),
  };
}

export function parseNetworkCounters(value: string): SshMonitorSnapshot["network"] {
  const [received = 0, sent = 0] = outputNumbers(value);
  return { received: Math.max(0, received), sent: Math.max(0, sent) };
}

function commandsFor(platform: SshMonitorPlatform): {
  readonly cpu: string;
  readonly memory: string;
  readonly disk: string;
  readonly network: string;
} {
  if (platform === "windows") {
    return {
      cpu: "powershell -NoProfile -Command \"(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average\"",
      memory: "powershell -NoProfile -Command \"$os=Get-CimInstance Win32_OperatingSystem; '{0} {1}' -f ($os.TotalVisibleMemorySize*1024), (($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)*1024)\"",
      disk: "powershell -NoProfile -Command \"$d=Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3'; '{0} {1}' -f (($d | Measure-Object Size -Sum).Sum), (($d | ForEach-Object { $_.Size - $_.FreeSpace } | Measure-Object -Sum).Sum)\"",
      network: "powershell -NoProfile -Command \"$n=Get-NetAdapterStatistics; '{0} {1}' -f (($n | Measure-Object ReceivedBytes -Sum).Sum), (($n | Measure-Object SentBytes -Sum).Sum)\"",
    };
  }
  if (platform === "macos") {
    return {
      cpu: "top -l 1 | grep 'CPU usage'",
      memory: "printf '%s ' \"$(sysctl -n hw.memsize)\"; vm_stat | awk '/Pages free/ {gsub(/\\./, \"\", $3); print $3*4096}'",
      disk: "df -k / | tail -n 1 | awk '{print $2*1024,$3*1024,$5}'",
      network: "netstat -ib | awk 'NR>1 {rx+=$7; tx+=$10} END {print rx,tx}'",
    };
  }
  return {
    cpu: "top -bn1 2>/dev/null | grep -E '%?Cpu\\(s\\)|%Cpu' | head -n 1",
    memory: "free -b 2>/dev/null | awk '/Mem:/ {print $2,$7}'",
    disk: "df -B1 / 2>/dev/null | awk 'NR==2 {print $2,$3,$5}'",
    network: "cat /proc/net/dev 2>/dev/null | awk -F: 'NR>2 {gsub(/^ +| +$/, \"\", $2); split($2,a,/ +/); rx+=a[1]; tx+=a[9]} END {print rx,tx}'",
  };
}

export async function fetchSshMonitorSnapshot(
  session: Pick<SshSession, "exec">,
): Promise<SshMonitorSnapshot> {
  const platform = detectSshMonitorPlatform(await execText(session, "uname -s 2>/dev/null || ver"));
  const commands = commandsFor(platform);
  const [cpuOutput, memoryOutput, diskOutput] = await Promise.all([
    execText(session, commands.cpu),
    execText(session, commands.memory),
    execText(session, commands.disk),
  ]);
  let networkOutput = "0 0";
  try {
    networkOutput = await execText(session, commands.network);
  } catch {
    // Network counters are optional on Windows and restricted SSH accounts.
  }
  const memory = parseMemoryUsage(memoryOutput, platform !== "windows");
  const disk = parseDiskUsage(diskOutput, platform);
  return {
    cpu: parseCpuUsage(cpuOutput, platform),
    ...memory,
    ...disk,
    network: parseNetworkCounters(networkOutput),
  };
}
