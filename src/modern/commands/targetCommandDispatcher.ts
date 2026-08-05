import type * as vscode from "vscode";

import type { Disposable } from "../core/contracts";
import { SourceRecoveryPendingError } from "../core/errors";
import { CommandRegistry, type CommandHandler } from "./commandRegistry";
import type { ModernCommandHost } from "./modernCommandHost";
import { TARGET_COMMAND_IDS } from "./manifestCommands";
import {
  createVscodeTableCommandHost,
  registerTableCommandHandlers,
  type TableCommandHost,
} from "./tableCommands";
import { VscodeCommandRegistrar } from "./vscodeCommandRegistrar";

/**
 * These method names are taken from the target command maps. Keeping them as
 * data makes the recovered boundary easy to audit and lets each migrated node
 * implement only the capability it owns.
 */
const targetNodeMethods: Readonly<Record<string, string>> = {
  "mysql.connection.terminal": "openTerminal",
  "mysql.connection.copyKey": "copyKey",
  "mysql.connection.startRdp": "startRdp",
  "mysql.connection.copy": "copy",
  "mysql.connection.open": "openConnection",
  "mysql.connection.disable": "disableConnection",
  "mysql.connection.delete": "deleteConnection",
  "mysql.connection.selectDb": "selectDB",
  "mysql.host.copy": "copyName",
  "mysql.db.truncate": "truncateDb",
  "mysql.database.add": "createDatabase",
  "mysql.template.schema": "schemaTemplate",
  "mysql.db.drop": "dropDatabase",
  "mysql.package.source": "showSource",
  "mysql.package.drop": "drop",
  "mysql.query.delete": "reqDelete",
  "mysql.query.add": "add",
  "mysql.query.book.add": "add",
  "mysql.query.link": "linkFolder",
  "mysql.query.open": "open",
  "mysql.query.rename": "rename",
  "mysql.template.new": "createTemplate",
  "mysql.delete.procedure": "drop",
  "mysql.show.procedure": "showSource",
  "mysql.delete.function": "drop",
  "mysql.show.function": "showSource",
  "mysql.delete.event": "drop",
  "mysql.show.event": "showSource",
  "mysql.delete.trigger": "drop",
  "mysql.show.trigger": "showSource",
  "mysql.struct.dump": "dump",
  "mysql.data.dump": "dump",
  "mysql.es.restore": "restore",
  "mysql.redis.dump": "dump",
  "mysql.redis.restore": "restore",
  "mysql.table.truncate": "truncateTable",
  "mysql.table.copy": "copyTable",
  "mysql.table.drop": "drop",
  "mysql.table.sort": "changeSortRule",
  "mysql.delete.view": "drop",
  "mysql.table.find": "viewData",
  "mysql.table.show": "viewData",
  "mysql.table.design": "designTable",
  "mysql.view.source": "showDdl",
  "mysql.template.table": "createTemplate",
  "mysql.template.view": "createTemplate",
  "mysql.column.up": "moveUp",
  "mysql.column.down": "moveDown",
  "mysql.column.add": "addColumnTemplate",
  "mysql.column.update": "updateColumnTemplate",
  "mysql.column.drop": "dropColumnTemplate",
  "mysql.column.createIndex": "createIndexTemplate",
  "mysql.index.modify": "updateIndexTemplate",
  "mysql.index.drop": "dropIndexTemplate",
  "mysql.template.table.insert": "insertTemplate",
  "mysql.template.table.update": "updateSQLTemplate",
  "mysql.template.table.delete": "deleteSQLTemplate",
  "mysql.mongo.collection.insert": "insertTemplate",
  "mysql.mongo.collection.delete": "drop",
  "mysql.connection.neo4j.browser": "openNeo4jBrowser",
  "mysql.neo4j.relation.find": "viewData",
  "mysql.redis.key.detail": "detail",
  "mysql.redis.key.del": "delete",
  "mysql.redis.loadMore": "click",
  "mysql.keyValue.node.new": "newNode",
  "mysql.keyValue.node.edit": "editData",
  "mysql.keyValue.node.delete": "reqDelete",
  "mysql.rabbit.queue.new": "reqCreate",
  "mysql.rabbit.queue.bind": "reqCreateBinding",
  "mysql.rabbit.queue.inspect": "inspectMessages",
  "mysql.rabbit.queue.delete": "reqDelete",
  "mysql.rabbit.binding.delete": "reqDelete",
  "mysql.rabbit.vhost.new": "createVhost",
  "mysql.rabbit.vhost.delete": "deleteVhost",
  "mysql.rabbit.user.new": "createUser",
  "mysql.rabbit.user.delete": "deleteUser",
  "mysql.rabbit.user.updatePassword": "updatePassword",
  "mysql.rabbit.user.addRole": "addRole",
  "mysql.rabbit.role.delete": "removeRole",
  "mysql.docker.node.drop": "delete",
  "mysql.docker.container.id.copy": "copyID",
  "mysql.docker.container.open.ports": "openPortInBrowser",
  "mysql.docker.container.new": "newComposeTemplate",
  "mysql.docker.container.cleanUp": "cleanUp",
  "mysql.docker.container.showStats": "showStats",
  "mysql.docker.container.restart": "restart",
  "mysql.docker.container.start": "start",
  "mysql.docker.container.stop": "stop",
  "mysql.docker.container.pause": "pause",
  "mysql.docker.container.unpause": "unpause",
  "mysql.docker.container.inspect": "inspect",
  "mysql.docker.container.updateRestartPolicy": "updateRestartPolicy",
  "mysql.docker.container.showLogs": "showLogs",
  "mysql.docker.container.terminal": "openTerminal",
  "mysql.docker.image.new": "newImage",
  "mysql.docker.image.cleanUp": "cleanUp",
  "mysql.docker.image.run": "createContainer",
  "mysql.docker.image.runDetach": "createContainer",
  "mysql.docker.image.pull": "pullLatest",
  "mysql.docker.image.id.copy": "copyID",
  "mysql.docker.image.document": "openDocument",
  "mysql.docker.image.inspect": "inspectImage",
  "mysql.docker.network.new": "newNetwork",
  "mysql.docker.network.cleanUp": "cleanUp",
  "mysql.docker.network.delete": "delete",
  "mysql.docker.network.inspect": "inspect",
  "mysql.docker.volume.new": "newVolume",
  "mysql.docker.volume.cleanUp": "cleanUp",
  "mysql.docker.volume.inspect": "inspect",
  "mysql.docker.volume.delete": "delete",
  "mysql.ssh.forward.port": "forwardPort",
  "mysql.ssh.user.new": "newUser",
  "mysql.ssh.user.delete": "delete",
  "mysql.ssh.user.updatePassword": "updatePassword",
  "mysql.ssh.user.uploadPublicKey": "uploadPublicKey",
  "mysql.ssh.folder.terminal": "openTerminal",
  "mysql.ssh.server.status": "status",
  "mysql.ssh.sh.execute": "executeShell",
  "mysql.fs.terminal": "openTerminal",
  "mysql.file.open": "open",
  "mysql.file.delete": "delete",
  "mysql.file.new": "newFile",
  "mysql.file.upload": "upload",
  "mysql.folder.upload": "upload",
  "mysql.folder.new": "newFolder",
  "mysql.bucket.new": "newBucket",
  "mysql.path.copy": "copyPath",
  "mysql.file.download": "download",
  "mysql.node.rename": "rename",
  "mysql.node.favorite.clear": "clear",
  "mysql.node.favorite": "doFavorite",
  "mysql.node.favorite.cancel": "doFavorite",
  "mysql.ftp.connect": "connectToNewWindow",
  "mysql.show.esIndex": "viewData",
  "mysql.es.template.search": "searchTemplate",
  "mysql.es.template.insert": "insertTemplate",
  "mysql.es.template.update": "updateTemplate",
  "mysql.es.template.analyze": "analyzeTemplate",
  "mysql.es.template.aggregations": "aggregationsTemplate",
  "mysql.es.index.new": "createTemplate",
  "mysql.es.stream.new": "createTemplate",
  "mysql.es.index.delete": "drop",
  "mysql.es.index.showSettings": "showSettings",
  "mysql.es.index.mapping": "mappingIndex",
  "mysql.mq.consume": "prepareConsume",
  "mysql.mq.produce": "prepareProduce",
  "mysql.kafka.topic.new": "reqCreate",
  "mysql.kafka.topic.delete": "reqDelete",
  "mysql.kafka.consumer.delete": "reqDelete",
  "mysql.kafka.offset.setOffset": "setOffset",
  "mysql.kafka.offset.resetOffset": "resetOffset",
};

function invokeNodeMethod(
  command: string,
  method: string,
  args: readonly unknown[],
): unknown {
  const target = args[0];
  if (!target || typeof target !== "object") {
    throw new Error(`Command ${command} requires a selected tree target`);
  }
  const operation = (target as Record<string, unknown>)[method];
  if (typeof operation !== "function") {
    throw new SourceRecoveryPendingError(command);
  }
  return operation.apply(target, args.slice(1));
}

function pendingHandler(command: string): CommandHandler {
  return () => {
    throw new SourceRecoveryPendingError(command);
  };
}

function createDirectCommandHandlers(
  host: ModernCommandHost,
): Readonly<Record<string, CommandHandler>> {
  return {
    "mysql2.refresh": (target) => host.refresh(target),
    "mysql2.refresh.all": () => host.refreshAll(),
    "mysql2.refreshTree": () => host.refreshAll(),
    "mysql.console.open": () => host.openConsole(),
    "mysql.runSQL": (sql) => host.runSql(typeof sql === "string" ? sql : undefined),
    "mysql.runSQLInNew": (sql) =>
      host.runSql(typeof sql === "string" ? sql : undefined, { newView: true }),
    "mysql.runSQLAsJSON": (sql) =>
      host.runSql(typeof sql === "string" ? sql : undefined, { json: true }),
    "mysql.runSQLWithoutParse": (sql) =>
      host.runSql(typeof sql === "string" ? sql : undefined, { parse: false }),
    "mysql.runAllQuery": () => host.runSql(undefined),
    "mysql.runAllQueryWithoutParse": () => host.runSql(undefined, { parse: false }),
    "mysql.notebook.sql": (target) => host.openQuery(target),
    "mysql.connection.add": () => host.openConnection("create"),
    "mysql.connection.add.viaGroup": (target) => host.openConnection("create", target),
    "mysql.connection.edit": (target) => host.openConnection("edit", target),
    "mysql.connection.copy": (target) => host.openConnection("copy", target),
    "mysql.connection.quickConnect": (target) => host.openConnection("create", target),
    "mysql.node.create": (target) => host.createNode(target),
    "mysql.query.switch": (target) => host.openQuery(target),
    "mysql.notebook.new": () => host.openQuery(),
    "mysql.notebook.open": () => host.openQuery(),
    "mysql.history.open": (target) => host.openHistory(target),
    "mysql.history.open.all": () => host.openHistory(),
    "mysql.history.clear": () => host.clearHistory(),
  };
}

export interface TargetCommandRegistrationSummary {
  readonly commandIds: readonly string[];
  readonly nodeMethodIds: readonly string[];
  readonly pendingIds: readonly string[];
}

type RegisterCommand = typeof vscode.commands.registerCommand;

function createDefaultCommandRegistrar(): RegisterCommand {
  const vscodeModule = require("vscode") as typeof import("vscode");
  return vscodeModule.commands.registerCommand.bind(vscodeModule.commands);
}

const unavailableTableHost: TableCommandHost = {
  writeClipboard: async () => {
    throw new SourceRecoveryPendingError("mysql.name.copy");
  },
  openSqlDocument: async () => {
    throw new SourceRecoveryPendingError("mysql.table.source");
  },
  showTextDocument: async () => {
    throw new SourceRecoveryPendingError("mysql.table.source");
  },
};

export function summarizeTargetCommands(): TargetCommandRegistrationSummary {
  const nodeMethodIds = TARGET_COMMAND_IDS.filter(
    (command) => command in targetNodeMethods,
  );
  const implementedIds = new Set([
    "mysql.name.copy",
    "mysql.table.source",
    "mysql.template.table.select",
    ...nodeMethodIds,
  ]);
  return {
    commandIds: TARGET_COMMAND_IDS,
    nodeMethodIds,
    pendingIds: TARGET_COMMAND_IDS.filter((command) => !implementedIds.has(command)),
  };
}

export function registerTargetCommands(
  register?: RegisterCommand,
  tableHost?: TableCommandHost,
  commandHost?: ModernCommandHost,
): Disposable[] {
  const registry = new CommandRegistry();
  const usingDefaultHost = register === undefined;
  const registrar = new VscodeCommandRegistrar(
    registry,
    register ?? createDefaultCommandRegistrar(),
  );
  const registrations = registerTableCommandHandlers(
    registrar,
    tableHost ??
      (usingDefaultHost ? createVscodeTableCommandHost() : unavailableTableHost),
  );
  const registered = new Set([
    "mysql.name.copy",
    "mysql.table.source",
    "mysql.template.table.select",
  ]);
  const directHandlers = commandHost
    ? createDirectCommandHandlers(commandHost)
    : undefined;

  for (const command of TARGET_COMMAND_IDS) {
    if (registered.has(command)) {
      continue;
    }
    const method = targetNodeMethods[command];
    registrations.push(
      registrar.registerCommand(
        command,
        directHandlers?.[command]
          ? directHandlers[command]
          : method
          ? (...args: unknown[]) => invokeNodeMethod(command, method, args)
          : pendingHandler(command),
      ),
    );
    registered.add(command);
  }
  return registrations;
}
