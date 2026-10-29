export interface CodeLensCommand {
  readonly command: string;
  readonly title: string;
}

export interface SqlCodeLensContext {
  readonly isQuery: boolean;
  readonly isTemplate: boolean;
  readonly isMultiLine: boolean;
  readonly lineCount: number;
  readonly appName?: string;
  readonly copilotInstalled?: boolean;
}

export function sqlCodeLensCommands(
  context: SqlCodeLensContext,
): CodeLensCommand[] {
  const commands: CodeLensCommand[] = [];
  if ((context.isMultiLine && !context.isTemplate)
    || (!context.isQuery && context.lineCount >= 2)) {
    commands.push({ command: "mysql.codeLens.copy", title: "$(copy) Select" });
  }
  if (context.isMultiLine || context.isQuery) {
    const command = context.appName === "Cursor"
      ? "mysql.ai.cursor"
      : context.copilotInstalled
        ? "mysql.ai.copilot"
        : undefined;
    if (command) {
      commands.push({ command, title: "$(comment-discussion) Ask AI" });
    }
  }
  return commands;
}

export function messageQueueCodeLensCommands(
  producer: boolean,
  connectionType: string | undefined,
  consumerRunning = false,
): readonly CodeLensCommand[] {
  if (producer) {
    return [
      { command: "mysql.kafka.topic.produce.send", title: "$(run) Send" },
      ...(connectionType === "Kafka"
        ? [{ command: "mysql.kafka.topic.producer.kill", title: "$(debug-stop) Stop Producer" }]
        : []),
    ];
  }
  if (consumerRunning) {
    return [{ command: "mysql.kafka.consumer.stop", title: "$(debug-stop) Stop Consumer" }];
  }
  return [
    { command: "mysql.kafka.consumer.start", title: "$(debug-start) Start Consumer" },
    ...(connectionType === "Kafka"
      ? [{ command: "mysql.kafka.consumer.configOffset", title: "$(gear) Configure Offset" }]
      : []),
  ];
}

export function dockerComposeCodeLensEnabled(
  connectionType: string | undefined,
  isUntitled: boolean,
): boolean {
  return connectionType === "Docker" && !isUntitled;
}
