import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import {
  dockerComposeCodeLensEnabled,
  messageQueueCodeLensCommands,
} from "./supplementalCodeLens";

function firstRange(document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(0, 0, 0, Math.min(document.lineAt(0).text.length, 1));
}

export class MockCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const range = firstRange(document);
    return [
      new vscode.CodeLens(range, {
        command: "mysql.mock.run",
        title: "$(run) Run Mock",
        arguments: [{ document }],
      }),
      new vscode.CodeLens(range, {
        command: "mysql.mock.reset",
        title: "✨ Reset Config",
        arguments: [{ document }],
      }),
    ];
  }
}

export class MessageQueueCodeLensProvider implements vscode.CodeLensProvider {
  public constructor(
    private readonly producer: boolean,
    private readonly services: ExtensionServices,
  ) {}

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const range = firstRange(document);
    const connectionType = this.services.activeConnection.get()?.type;
    const commands = messageQueueCodeLensCommands(
      this.producer,
      connectionType,
      !this.producer && this.services.messageCommands.isConsumerRunning(document),
    );
    return commands.map((item) => new vscode.CodeLens(range, {
      command: item.command,
      title: item.title,
      arguments: [document],
    }));
  }
}

export class DockerComposeCodeLensProvider implements vscode.CodeLensProvider {
  public constructor(private readonly services: ExtensionServices) {}

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!dockerComposeCodeLensEnabled(
      this.services.activeConnection.get()?.type,
      document.isUntitled,
    )) return [];
    const range = firstRange(document);
    return [
      new vscode.CodeLens(range, {
        command: "mysql.docker.compose.pull",
        title: "$(arrow-down) Pull Images",
        arguments: [{ document }],
      }),
      new vscode.CodeLens(range, {
        command: "mysql.docker.compose.run",
        title: "$(run) Compose Up",
        arguments: [{ document }],
      }),
    ];
  }
}

export function registerSupplementalLanguageProviders(
  services: ExtensionServices,
): vscode.Disposable[] {
  return [
    vscode.languages.registerCodeLensProvider(
      [
        { language: "json", pattern: "**/*-mock.json" },
        { language: "jsonc", pattern: "**/*-mock.json" },
      ],
      new MockCodeLensProvider(),
    ),
    vscode.languages.registerCodeLensProvider(
      { language: "json", pattern: "**/*.producer" },
      new MessageQueueCodeLensProvider(true, services),
    ),
    vscode.languages.registerCodeLensProvider(
      { language: "dbclient-mq-consumer", pattern: "**/*.consumer" },
      new MessageQueueCodeLensProvider(false, services),
    ),
    vscode.languages.registerCodeLensProvider(
      { language: "dockercompose", pattern: "**/docker-compose.yml" },
      new DockerComposeCodeLensProvider(services),
    ),
  ];
}
