import type { Logger } from "./contracts";

export interface OutputChannelLike {
  appendLine(value: string): void;
}

function formatDetails(details: unknown): string {
  if (details === undefined) {
    return "";
  }
  if (details instanceof Error) {
    return " " + details.stack;
  }
  if (typeof details === "string") {
    return " " + details;
  }
  try {
    return " " + JSON.stringify(details);
  } catch {
    return " [unserializable details]";
  }
}

export class ChannelLogger implements Logger {
  public constructor(private readonly channel: OutputChannelLike) {}

  public debug(message: string, details?: unknown): void {
    this.write("DEBUG", message, details);
  }

  public info(message: string, details?: unknown): void {
    this.write("INFO", message, details);
  }

  public warn(message: string, details?: unknown): void {
    this.write("WARN", message, details);
  }

  public error(message: string, error?: unknown): void {
    this.write("ERROR", message, error);
  }

  private write(level: string, message: string, details?: unknown): void {
    this.channel.appendLine("[" + level + "] " + message + formatDetails(details));
  }
}

export class NoopLogger implements Logger {
  public debug(): void {}
  public info(): void {}
  public warn(): void {}
  public error(): void {}
}
