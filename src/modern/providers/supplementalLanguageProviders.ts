import * as vscode from "vscode";

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
  public constructor(private readonly producer: boolean) {}

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const range = firstRange(document);
    if (this.producer) {
      return [
        new vscode.CodeLens(range, {
          command: "mysql.kafka.topic.produce.send",
          title: "$(run) Send",
          arguments: [document],
        }),
        new vscode.CodeLens(range, {
          command: "mysql.kafka.topic.producer.kill",
          title: "$(debug-stop) Stop Producer",
          arguments: [document],
        }),
      ];
    }
    return [
      new vscode.CodeLens(range, {
        command: "mysql.kafka.consumer.start",
        title: "$(debug-start) Start Consumer",
        arguments: [document],
      }),
      new vscode.CodeLens(range, {
        command: "mysql.kafka.consumer.configOffset",
        title: "$(gear) Configure Offset",
        arguments: [document],
      }),
    ];
  }
}

export class DockerComposeCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
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

export function registerSupplementalLanguageProviders(): vscode.Disposable[] {
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
      new MessageQueueCodeLensProvider(true),
    ),
    vscode.languages.registerCodeLensProvider(
      { language: "dbclient-mq-consumer", pattern: "**/*.consumer" },
      new MessageQueueCodeLensProvider(false),
    ),
    vscode.languages.registerCodeLensProvider(
      { language: "dockercompose", pattern: "**/docker-compose.yml" },
      new DockerComposeCodeLensProvider(),
    ),
  ];
}
