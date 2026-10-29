import type * as vscode from "vscode";

import type { Disposable } from "../core/contracts";
import { SourceRecoveryPendingError } from "../core/errors";
import { CommandRegistry, type CommandHandler } from "./commandRegistry";
import type { ModernCommandHost } from "./modernCommandHost";
import { VscodeCommandRegistrar } from "./vscodeCommandRegistrar";

/**
 * These commands are used by target providers or tree item click handlers but
 * are intentionally not contributed through package.json. The target bundle
 * registers them alongside the public command map, so keep the boundary
 * explicit instead of silently dropping provider actions.
 */
export const MODERN_INTERNAL_COMMAND_IDS = Object.freeze([
  "mysql.query.open",
  "mysql.history.view",
  "mysql.codeLens.run",
  "mysql.codeLens.copy",
  "mysql.ai.copilot",
  "mysql.ai.cursor",
  "mysql.mock.reset",
  "mysql.elastic.execute",
  "mysql.elastic.document",
  "mysql.elastic.copyAsCurl",
  "mysql.elastic.lint",
  "mysql.template.ddl.reset",
  "mysql.kafka.topic.produce.send",
  "mysql.kafka.topic.producer.kill",
  "mysql.kafka.consumer.start",
  "mysql.kafka.consumer.stop",
  "mysql.kafka.consumer.configOffset",
  "mysql.docker.compose.pull",
  "mysql.redis.loadMore",
] as const);

export const MODERN_INTERNAL_PENDING_COMMAND_IDS = Object.freeze([
] as const);

type RegisterCommand = typeof vscode.commands.registerCommand;

function createDefaultCommandRegistrar(): RegisterCommand {
  const vscodeModule = require("vscode") as typeof import("vscode");
  return vscodeModule.commands.registerCommand.bind(vscodeModule.commands);
}

function pendingHandler(command: string): CommandHandler {
  return () => {
    throw new SourceRecoveryPendingError(command);
  };
}

function optionalAction(
  command: string,
  action: ((...args: unknown[]) => Promise<unknown> | unknown) | undefined,
): CommandHandler {
  return (...args) => {
    if (!action) {
      throw new SourceRecoveryPendingError(command);
    }
    return action(...args);
  };
}

function internalHandlers(
  host: ModernCommandHost | undefined,
): Readonly<Record<string, CommandHandler>> {
  return {
    "mysql.query.open": optionalAction(
      "mysql.query.open",
      host ? (target) => host.openQuery(target) : undefined,
    ),
    "mysql.history.view": optionalAction(
      "mysql.history.view",
      host?.viewHistory ? (target) => host.viewHistory?.(target) : undefined,
    ),
    "mysql.codeLens.run": optionalAction(
      "mysql.codeLens.run",
      host?.runCodeLens ? (target) => host.runCodeLens?.(target) : undefined,
    ),
    "mysql.codeLens.copy": optionalAction(
      "mysql.codeLens.copy",
      host?.selectCodeLens
        ? (uri, range) => host.selectCodeLens?.(uri, range)
        : undefined,
    ),
    "mysql.ai.copilot": optionalAction(
      "mysql.ai.copilot",
      host?.runAi ? (uri, range) => host.runAi?.(uri, range, "copilot") : undefined,
    ),
    "mysql.ai.cursor": optionalAction(
      "mysql.ai.cursor",
      host?.runAi ? (uri, range) => host.runAi?.(uri, range, "cursor") : undefined,
    ),
    "mysql.mock.reset": optionalAction(
      "mysql.mock.reset",
      host?.resetMock ? (target) => host.resetMock?.(target) : undefined,
    ),
    "mysql.elastic.execute": optionalAction(
      "mysql.elastic.execute",
      host?.runElasticQuery
        ? (request, parse) => host.runElasticQuery?.(request, parse === true)
        : undefined,
    ),
    "mysql.elastic.document": optionalAction(
      "mysql.elastic.document",
      host?.openElasticDocument
        ? (request) => host.openElasticDocument?.(request)
        : undefined,
    ),
    "mysql.elastic.copyAsCurl": optionalAction(
      "mysql.elastic.copyAsCurl",
      host?.copyElasticAsCurl
        ? (request) => host.copyElasticAsCurl?.(request)
        : undefined,
    ),
    "mysql.elastic.lint": optionalAction(
      "mysql.elastic.lint",
      host?.lintElastic ? (request) => host.lintElastic?.(request) : undefined,
    ),
    "mysql.template.ddl.reset": optionalAction(
      "mysql.template.ddl.reset",
      host?.resetDdlTemplate
        ? (connection, createType, uri, range) => host.resetDdlTemplate?.(
          connection,
          createType,
          uri,
          range,
        )
        : undefined,
    ),
    "mysql.kafka.topic.produce.send": optionalAction(
      "mysql.kafka.topic.produce.send",
      host?.sendMessage ? (document) => host.sendMessage?.(document) : undefined,
    ),
    "mysql.kafka.topic.producer.kill": optionalAction(
      "mysql.kafka.topic.producer.kill",
      host?.stopMessageProducer
        ? (document) => host.stopMessageProducer?.(document)
        : undefined,
    ),
    "mysql.kafka.consumer.start": optionalAction(
      "mysql.kafka.consumer.start",
      host?.startMessageConsumer
        ? (document) => host.startMessageConsumer?.(document)
        : undefined,
    ),
    "mysql.kafka.consumer.stop": optionalAction(
      "mysql.kafka.consumer.stop",
      host?.stopMessageConsumer
        ? (document) => host.stopMessageConsumer?.(document)
        : undefined,
    ),
    "mysql.kafka.consumer.configOffset": optionalAction(
      "mysql.kafka.consumer.configOffset",
      host?.configureMessageOffset
        ? (document) => host.configureMessageOffset?.(document)
        : undefined,
    ),
    "mysql.docker.compose.pull": optionalAction(
      "mysql.docker.compose.pull",
      host?.pullDockerCompose ? (target) => host.pullDockerCompose?.(target) : undefined,
    ),
    "mysql.redis.loadMore": optionalAction(
      "mysql.redis.loadMore",
      (target) => {
        if (!target || typeof target !== "object") {
          throw new Error("Redis load-more requires a tree target");
        }
        const candidate = target as { click?: unknown };
        if (typeof candidate.click !== "function") {
          throw new Error("Redis load-more target is not clickable");
        }
        return (candidate.click as () => Promise<unknown> | unknown)();
      },
    ),
  };
}

export function registerInternalCommands(
  host?: ModernCommandHost,
  register?: RegisterCommand,
): Disposable[] {
  const registry = new CommandRegistry();
  const registrar = new VscodeCommandRegistrar(
    registry,
    register ?? createDefaultCommandRegistrar(),
  );
  const handlers = internalHandlers(host);
  return MODERN_INTERNAL_COMMAND_IDS.map((command) =>
    registrar.registerCommand(
      command,
      handlers[command] ?? pendingHandler(command),
    ),
  );
}
