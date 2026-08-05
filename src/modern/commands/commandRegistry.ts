import type { Disposable } from "../core/contracts";

export type CommandHandler = (...args: unknown[]) => unknown;

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  public register(command: string, handler: CommandHandler): Disposable {
    if (this.handlers.has(command)) {
      throw new Error("Command already registered: " + command);
    }
    this.handlers.set(command, handler);
    return {
      dispose: () => {
        if (this.handlers.get(command) === handler) {
          this.handlers.delete(command);
        }
      },
    };
  }

  public has(command: string): boolean {
    return this.handlers.has(command);
  }

  public async execute(command: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(command);
    if (!handler) {
      throw new Error("Command is not registered: " + command);
    }
    return handler(...args);
  }

  public ids(): readonly string[] {
    return [...this.handlers.keys()].sort((left, right) =>
      left.localeCompare(right),
    );
  }
}
