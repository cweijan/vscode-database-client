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
  "mysql.redis.key.new": "newNode",
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
  "mysql.docker.compose.run": "newComposeTemplate",
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
  "mysql.ssh.connect": "connect",
  "mysql.ssh.monitor": "monitor",
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
  const optional = (
    command: string,
    action: (() => Promise<unknown> | unknown) | undefined,
  ): CommandHandler => {
    return () => {
      if (!action) {
        throw new SourceRecoveryPendingError(command);
      }
      return action();
    };
  };
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
    "mysql.server.info": (target) => optional("mysql.server.info", host.serverInfo ? () => host.serverInfo?.(target) : undefined)(),
    "mysql.node.filterChildren": (target) => optional("mysql.node.filterChildren", host.filterChildren ? () => host.filterChildren?.(target) : undefined)(),
    "mysql.db.active": (target) => optional("mysql.db.active", host.activateDatabase ? () => host.activateDatabase?.(target) : undefined)(),
    "mysql.db.active.switch": (target) => optional("mysql.db.active.switch", host.activateDatabase ? () => host.activateDatabase?.(target) : undefined)(),
    "mysql.document.generate": (target) => optional("mysql.document.generate", host.generateDocument ? () => host.generateDocument?.(target) : undefined)(),
    "mysql.struct.diff": (target) => optional("mysql.struct.diff", host.openUtility ? () => host.openUtility?.("structDiff", "Structure Diff", target) : undefined)(),
    "mysql.sql.import": (target) => optional("mysql.sql.import", host.importSql ? () => host.importSql?.(target) : undefined)(),
    "mysql.mock.table": (target) => optional("mysql.mock.table", host.createMock ? () => host.createMock?.(target) : undefined)(),
    "mysql.mock.run": (target) => optional("mysql.mock.run", host.runMock ? () => host.runMock?.(target) : undefined)(),
    "mysql.changeTableName": (target) => optional("mysql.changeTableName", host.changeTableName ? () => host.changeTableName?.(target) : undefined)(),
    "mysql.table.fullTextSearch": (target) => optional("mysql.table.fullTextSearch", host.fullTextSearch ? () => host.fullTextSearch?.(target) : undefined)(),
    "mysql.user.grant": (target) => optional("mysql.user.grant", host.userAction ? () => host.userAction?.("grant", target) : undefined)(),
    "mysql.change.user": (target) => optional("mysql.change.user", host.userAction ? () => host.userAction?.("change", target) : undefined)(),
    "mysql.template.user": (target) => optional("mysql.template.user", host.userAction ? () => host.userAction?.("template", target) : undefined)(),
    "mysql.delete.user": (target) => optional("mysql.delete.user", host.userAction ? () => host.userAction?.("delete", target) : undefined)(),
    "mysql.s3.selectBuckets": (target) => optional("mysql.s3.selectBuckets", host.openUtility ? () => host.openUtility?.("fileManager", "S3 Buckets", target) : undefined)(),
    "mysql.s3.url.temp": (target) => optional("mysql.s3.url.temp", host.openUtility ? () => host.openUtility?.("fileManager", "S3 Temporary URL", target) : undefined)(),
    "mysql.s3.url.public": (target) => optional("mysql.s3.url.public", host.openUtility ? () => host.openUtility?.("fileManager", "S3 Public URL", target) : undefined)(),
    "mysql.s3.openSite": (target) => optional("mysql.s3.openSite", host.openUtility ? () => host.openUtility?.("fileManager", "S3 Website", target) : undefined)(),
    "mysql.file.manager": (target) => optional("mysql.file.manager", host.openUtility ? () => host.openUtility?.("fileManager", "File Manager", target) : undefined)(),
    "mysql.mongo.dump": (target) => optional("mysql.mongo.dump", host.openUtility ? () => host.openUtility?.("dbFileConnect", "MongoDB Dump", target) : undefined)(),
    "mysql.mongo.restore": (target) => optional("mysql.mongo.restore", host.openUtility ? () => host.openUtility?.("dbFileConnect", "MongoDB Restore", target) : undefined)(),
    "mysql.docker.compose.run": (target) => optional("mysql.docker.compose.run", host.runDockerCompose ? () => host.runDockerCompose?.(target) : undefined)(),
    "mysql.treeview.collapse": () => optional("mysql.treeview.collapse", host.collapseTrees ? () => host.collapseTrees?.(false) : undefined)(),
    "mysql.treeview.nosql.collapse": () => optional("mysql.treeview.nosql.collapse", host.collapseTrees ? () => host.collapseTrees?.(true) : undefined)(),
    "mysql.package.source": (target) => optional("mysql.package.source", host.openUtility ? () => host.openUtility?.("document", "Object Source", target) : undefined)(),
    "mysql.package.drop": (target) => optional("mysql.package.drop", host.openUtility ? () => host.openUtility?.("document", "Drop Object", target) : undefined)(),
    "mysql.query.link": (target) => optional("mysql.query.link", host.openUtility ? () => host.openUtility?.("manager", "Query Folder", target) : undefined)(),
    "mysql.query.add": (target) => optional("mysql.query.add", host.openQuery ? () => host.openQuery?.(target) : undefined)(),
    "mysql.query.book.add": (target) => optional("mysql.query.book.add", host.openQuery ? () => host.openQuery?.(target) : undefined)(),
    "mysql.query.rename": (target) => optional("mysql.query.rename", host.openUtility ? () => host.openUtility?.("manager", "Rename Query", target) : undefined)(),
    "mysql.query.delete": (target) => optional("mysql.query.delete", host.openUtility ? () => host.openUtility?.("manager", "Delete Query", target) : undefined)(),
    "mysql.template.new": (target) => optional("mysql.template.new", host.openUtility ? () => host.openUtility?.("document", "New Template", target) : undefined)(),
    "mysql.delete.event": (target) => optional("mysql.delete.event", host.openUtility ? () => host.openUtility?.("document", "Delete Event", target) : undefined)(),
    "mysql.data.dump": (target) => optional("mysql.data.dump", host.openUtility ? () => host.openUtility?.("dbFileConnect", "Data Export", target) : undefined)(),
    "mysql.struct.dump": (target) => optional("mysql.struct.dump", host.openUtility ? () => host.openUtility?.("dbFileConnect", "Structure Export", target) : undefined)(),
    "mysql.table.sort": (target) => optional("mysql.table.sort", host.openUtility ? () => host.openUtility?.("manager", "Table Sort", target) : undefined)(),
    "mysql.ftp.connect": (target) => optional("mysql.ftp.connect", host.openUtility ? () => host.openUtility?.("fileManager", "FTP Connection", target) : undefined)(),
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
  const recoveredNodeMethodIds = new Set([
    "mysql.connection.copy",
    "mysql.connection.open",
    "mysql.connection.disable",
    "mysql.connection.delete",
    "mysql.connection.terminal",
    "mysql.connection.selectDb",
    "mysql.host.copy",
    "mysql.db.truncate",
    "mysql.database.add",
    "mysql.db.drop",
    "mysql.template.schema",
    "mysql.table.copy",
    "mysql.table.truncate",
    "mysql.table.drop",
    "mysql.table.design",
    "mysql.table.show",
    "mysql.view.source",
    "mysql.delete.view",
    "mysql.delete.procedure",
    "mysql.delete.function",
    "mysql.delete.trigger",
    "mysql.show.procedure",
    "mysql.show.function",
    "mysql.show.trigger",
    "mysql.column.up",
    "mysql.column.down",
    "mysql.column.add",
    "mysql.column.update",
    "mysql.column.drop",
    "mysql.column.createIndex",
    "mysql.index.modify",
    "mysql.index.drop",
    "mysql.template.table.insert",
    "mysql.template.table.update",
    "mysql.template.table.delete",
    "mysql.template.table",
    "mysql.template.view",
    "mysql.mongo.collection.insert",
    "mysql.mongo.collection.delete",
    "mysql.connection.neo4j.browser",
    "mysql.es.stream.new",
    "mysql.es.index.new",
    "mysql.es.template.search",
    "mysql.es.template.insert",
    "mysql.es.template.update",
    "mysql.es.template.aggregations",
    "mysql.es.template.analyze",
    "mysql.es.index.showSettings",
    "mysql.es.index.mapping",
    "mysql.es.index.delete",
    "mysql.es.restore",
    "mysql.mq.consume",
    "mysql.mq.produce",
    "mysql.kafka.topic.new",
    "mysql.kafka.topic.delete",
    "mysql.kafka.consumer.delete",
    "mysql.kafka.offset.setOffset",
    "mysql.kafka.offset.resetOffset",
    "mysql.rabbit.queue.new",
    "mysql.rabbit.queue.bind",
    "mysql.rabbit.queue.inspect",
    "mysql.rabbit.queue.delete",
    "mysql.rabbit.binding.delete",
    "mysql.rabbit.vhost.new",
    "mysql.rabbit.vhost.delete",
    "mysql.rabbit.user.new",
    "mysql.rabbit.user.delete",
    "mysql.rabbit.user.updatePassword",
    "mysql.rabbit.user.addRole",
    "mysql.rabbit.role.delete",
    "mysql.redis.key.detail",
    "mysql.redis.key.del",
    "mysql.redis.key.new",
    "mysql.keyValue.node.new",
    "mysql.keyValue.node.edit",
    "mysql.keyValue.node.delete",
    "mysql.mongo.collection.insert",
    "mysql.mongo.collection.delete",
    "mysql.redis.dump",
    "mysql.redis.restore",
    "mysql.file.delete",
    "mysql.file.new",
    "mysql.file.upload",
    "mysql.folder.upload",
    "mysql.folder.new",
    "mysql.bucket.new",
    "mysql.path.copy",
    "mysql.file.download",
    "mysql.node.rename",
    "mysql.node.favorite",
    "mysql.node.favorite.cancel",
    "mysql.node.favorite.clear",
    "mysql.fs.terminal",
    "mysql.mongo.dump",
    "mysql.mongo.restore",
    "mysql.docker.node.drop",
    "mysql.docker.container.new",
    "mysql.docker.container.id.copy",
    "mysql.docker.container.open.ports",
    "mysql.docker.container.cleanUp",
    "mysql.docker.container.restart",
    "mysql.docker.container.start",
    "mysql.docker.container.stop",
    "mysql.docker.container.pause",
    "mysql.docker.container.unpause",
    "mysql.docker.container.inspect",
    "mysql.docker.container.showLogs",
    "mysql.docker.container.updateRestartPolicy",
    "mysql.docker.container.showStats",
    "mysql.docker.container.terminal",
    "mysql.docker.image.new",
    "mysql.docker.image.cleanUp",
    "mysql.docker.image.run",
    "mysql.docker.image.runDetach",
    "mysql.docker.image.pull",
    "mysql.docker.image.id.copy",
    "mysql.docker.image.document",
    "mysql.docker.network.new",
    "mysql.docker.network.cleanUp",
    "mysql.docker.volume.new",
    "mysql.docker.volume.cleanUp",
    "mysql.ssh.connect",
    "mysql.ssh.forward.port",
    "mysql.ssh.user.new",
    "mysql.ssh.user.delete",
    "mysql.ssh.user.updatePassword",
    "mysql.ssh.user.uploadPublicKey",
    "mysql.ssh.folder.terminal",
    "mysql.ssh.server.status",
    "mysql.ssh.monitor",
    "mysql.ssh.sh.execute",
  ]);
  const implementedIds = new Set([
    "mysql.name.copy",
    "mysql.table.source",
    "mysql.template.table.select",
    ...recoveredNodeMethodIds,
    "mysql2.refresh",
    "mysql2.refresh.all",
    "mysql.console.open",
    "mysql.runSQL",
    "mysql.runSQLInNew",
    "mysql.runSQLAsJSON",
    "mysql.runSQLWithoutParse",
    "mysql.runAllQuery",
    "mysql.runAllQueryWithoutParse",
    "mysql.notebook.sql",
    "mysql.connection.add",
    "mysql.connection.add.viaGroup",
    "mysql.connection.edit",
    "mysql.connection.quickConnect",
    "mysql.node.create",
    "mysql.query.switch",
    "mysql.notebook.new",
    "mysql.notebook.open",
    "mysql.history.open",
    "mysql.history.open.all",
    "mysql.history.clear",
    "mysql.server.info",
    "mysql.node.filterChildren",
    "mysql.db.active",
    "mysql.db.active.switch",
    "mysql.document.generate",
    "mysql.struct.diff",
    "mysql.sql.import",
    "mysql.mock.run",
    "mysql.mock.table",
    "mysql.changeTableName",
    "mysql.table.fullTextSearch",
    "mysql.user.grant",
    "mysql.change.user",
    "mysql.template.user",
    "mysql.delete.user",
    "mysql.s3.selectBuckets",
    "mysql.s3.url.temp",
    "mysql.s3.url.public",
    "mysql.s3.openSite",
    "mysql.file.manager",
    "mysql.mongo.dump",
    "mysql.mongo.restore",
    "mysql.docker.compose.run",
    "mysql.treeview.collapse",
    "mysql.treeview.nosql.collapse",
    "mysql.package.source",
    "mysql.package.drop",
    "mysql.query.link",
    "mysql.query.add",
    "mysql.query.book.add",
    "mysql.query.rename",
    "mysql.query.delete",
    "mysql.template.new",
    "mysql.delete.event",
    "mysql.data.dump",
    "mysql.struct.dump",
    "mysql.table.sort",
    "mysql.ftp.connect",
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
