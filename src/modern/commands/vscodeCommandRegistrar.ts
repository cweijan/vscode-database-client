import type * as vscode from "vscode";

import type { Disposable } from "../core/contracts";
import { CommandRegistry, type CommandHandler } from "./commandRegistry";

export class VscodeCommandRegistrar {
  public constructor(
    private readonly commands: CommandRegistry,
    private readonly register: typeof vscode.commands.registerCommand,
  ) {}

  public registerCommand(
    id: string,
    handler: CommandHandler,
  ): Disposable {
    const sourceRegistration = this.commands.register(id, handler);
    const vscodeRegistration = this.register(id, (...args: unknown[]) =>
      this.commands.execute(id, ...args),
    );
    return {
      dispose: () => {
        vscodeRegistration.dispose();
        sourceRegistration.dispose();
      },
    };
  }
}
