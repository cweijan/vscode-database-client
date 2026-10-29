import assert from "node:assert/strict";
import test from "node:test";

import { SourceRecoveryPendingError } from "../../src/modern/core/errors";
import {
  MODERN_INTERNAL_COMMAND_IDS,
  registerInternalCommands,
} from "../../src/modern/commands/internalCommandDispatcher";
import {
  registerTargetCommands,
  summarizeTargetCommands,
} from "../../src/modern/commands/targetCommandDispatcher";
import { TARGET_COMMAND_IDS } from "../../src/modern/commands/manifestCommands";
import type { ModernCommandHost } from "../../src/modern/commands/modernCommandHost";

test("internal provider commands stay registered outside the manifest surface", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const calls: unknown[][] = [];
  const host: ModernCommandHost = {
    refresh: () => {},
    refreshAll: () => {},
    openConnection: async () => {},
    openConsole: async () => {},
    runSql: async () => {},
    openQuery: async (...args) => { calls.push(["openQuery", ...args]); },
    createNode: async () => {},
    openHistory: async () => {},
    clearHistory: () => {},
    runCodeLens: async (...args) => { calls.push(["runCodeLens", ...args]); },
    resetMock: async (...args) => { calls.push(["resetMock", ...args]); },
    runElasticQuery: async (...args) => { calls.push(["runElasticQuery", ...args]); },
    openElasticDocument: async (...args) => { calls.push(["openElasticDocument", ...args]); },
    lintElastic: async (...args) => { calls.push(["lintElastic", ...args]); },
    sendMessage: async (...args) => { calls.push(["sendMessage", ...args]); },
    stopMessageProducer: async (...args) => { calls.push(["stopMessageProducer", ...args]); },
    startMessageConsumer: async (...args) => { calls.push(["startMessageConsumer", ...args]); },
    stopMessageConsumer: async (...args) => { calls.push(["stopMessageConsumer", ...args]); },
    configureMessageOffset: async (...args) => { calls.push(["configureMessageOffset", ...args]); },
    pullDockerCompose: async (...args) => { calls.push(["pullDockerCompose", ...args]); },
  };
  const registrations = registerInternalCommands(host, (id, handler) => {
    handlers.set(id, handler as (...args: unknown[]) => unknown);
    return { dispose: () => handlers.delete(id) };
  });

  assert.equal(registrations.length, MODERN_INTERNAL_COMMAND_IDS.length);
  assert.deepEqual([...handlers.keys()].sort(), [...MODERN_INTERNAL_COMMAND_IDS].sort());
  await handlers.get("mysql.query.open")?.({ id: "query" });
  await handlers.get("mysql.codeLens.run")?.({ source: "SELECT 1;" });
  await handlers.get("mysql.mock.reset")?.({ document: "mock.json" });
  await handlers.get("mysql.elastic.execute")?.({ path: "/_search" }, true);
  await handlers.get("mysql.elastic.document")?.({ path: "/_search" });
  await handlers.get("mysql.elastic.lint")?.({ body: {} });
  await handlers.get("mysql.kafka.topic.produce.send")?.({ uri: "producer" });
  await handlers.get("mysql.kafka.topic.producer.kill")?.({ uri: "producer" });
  await handlers.get("mysql.kafka.consumer.start")?.({ uri: "consumer" });
  await handlers.get("mysql.kafka.consumer.stop")?.({ uri: "consumer" });
  await handlers.get("mysql.kafka.consumer.configOffset")?.({ uri: "consumer" });
  await handlers.get("mysql.docker.compose.pull")?.({ uri: "compose" });

  assert.deepEqual(calls, [
    ["openQuery", { id: "query" }],
    ["runCodeLens", { source: "SELECT 1;" }],
    ["resetMock", { document: "mock.json" }],
    ["runElasticQuery", { path: "/_search" }, true],
    ["openElasticDocument", { path: "/_search" }],
    ["lintElastic", { body: {} }],
    ["sendMessage", { uri: "producer" }],
    ["stopMessageProducer", { uri: "producer" }],
    ["startMessageConsumer", { uri: "consumer" }],
    ["stopMessageConsumer", { uri: "consumer" }],
    ["configureMessageOffset", { uri: "consumer" }],
    ["pullDockerCompose", { uri: "compose" }],
  ]);

  const pendingHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const pendingRegistrations = registerInternalCommands(undefined, (id, handler) => {
    pendingHandlers.set(id, handler as (...args: unknown[]) => unknown);
    return { dispose: () => pendingHandlers.delete(id) };
  });
  await assert.rejects(
    Promise.resolve().then(() => pendingHandlers.get("mysql.docker.compose.pull")?.({})),
    (error: unknown) =>
      error instanceof SourceRecoveryPendingError &&
      error.code === "source-recovery-pending",
  );
  for (const registration of pendingRegistrations) registration.dispose();

  for (const registration of registrations) registration.dispose();
  assert.equal(handlers.size, 0);
});

test("target command dispatcher registers every manifest command", () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const registrations = registerTargetCommands((id, handler) => {
    handlers.set(id, handler as (...args: unknown[]) => unknown);
    return { dispose: () => handlers.delete(id) };
  });

  assert.equal(registrations.length, TARGET_COMMAND_IDS.length);
  assert.deepEqual([...handlers.keys()].sort(), [...TARGET_COMMAND_IDS].sort());
  for (const registration of registrations) {
    registration.dispose();
  }
  assert.equal(handlers.size, 0);
});

test("target command dispatcher invokes recovered node method boundaries", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  registerTargetCommands((id, handler) => {
    handlers.set(id, handler as (...args: unknown[]) => unknown);
    return { dispose: () => {} };
  });
  const calls: unknown[] = [];
  const result = await handlers.get("mysql.table.truncate")?.({
    truncateTable: (value: unknown) => {
      calls.push(value);
      return "done";
    },
  }, "extra");

  assert.equal(result, "done");
  assert.deepEqual(calls, ["extra"]);
});

test("MQ prepare commands open the target producer and consumer boundaries", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  registerTargetCommands((id, handler) => {
    handlers.set(id, handler as (...args: unknown[]) => unknown);
    return { dispose: () => {} };
  });
  const calls: string[] = [];
  const target = {
    prepareConsume: () => { calls.push("consume"); return "consumer.consumer"; },
    prepareProduce: () => { calls.push("produce"); return "producer.producer"; },
  };

  await handlers.get("mysql.mq.consume")?.(target);
  await handlers.get("mysql.mq.produce")?.(target);

  assert.deepEqual(calls, ["consume", "produce"]);
});

test("resource commands dispatch to typed S3 and FTP node methods", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  registerTargetCommands((id, handler) => {
    handlers.set(id, handler as (...args: unknown[]) => unknown);
    return { dispose: () => {} };
  });
  const calls: string[] = [];
  const target = {
    selectBuckets: () => { calls.push("selectBuckets"); },
    getTempUrl: () => { calls.push("getTempUrl"); },
    getPublicUrl: () => { calls.push("getPublicUrl"); },
    openSite: () => { calls.push("openSite"); },
    connectToNewWindow: () => { calls.push("connectToNewWindow"); },
  };

  await handlers.get("mysql.s3.selectBuckets")?.(target);
  await handlers.get("mysql.s3.url.temp")?.(target);
  await handlers.get("mysql.s3.url.public")?.(target);
  await handlers.get("mysql.s3.openSite")?.(target);
  await handlers.get("mysql.ftp.connect")?.(target);

  assert.deepEqual(calls, [
    "selectBuckets",
    "getTempUrl",
    "getPublicUrl",
    "openSite",
    "connectToNewWindow",
  ]);
  const summary = summarizeTargetCommands();
  for (const command of [
    "mysql.s3.selectBuckets",
    "mysql.s3.url.temp",
    "mysql.s3.url.public",
    "mysql.s3.openSite",
    "mysql.ftp.connect",
  ]) {
    assert.equal(summary.genericRouteIds.includes(command), false, command);
    assert.equal(summary.capabilities.find((item) => item.command === command)?.kind, "recovered-node", command);
  }
});

test("table sort dispatches to the typed table group", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  registerTargetCommands((id, handler) => {
    handlers.set(id, handler as (...args: unknown[]) => unknown);
    return { dispose: () => {} };
  });
  let called = false;
  const target = {
    changeSortRule: () => {
      called = true;
    },
  };

  await handlers.get("mysql.table.sort")?.(target);

  assert.equal(called, true);
  const summary = summarizeTargetCommands();
  assert.equal(summary.genericRouteIds.includes("mysql.table.sort"), false);
  assert.equal(
    summary.capabilities.find((item) => item.command === "mysql.table.sort")?.kind,
    "recovered-node",
  );
});

test("event and user commands dispatch to recovered tree nodes", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  registerTargetCommands((id, handler) => {
    handlers.set(id, handler as (...args: unknown[]) => unknown);
    return { dispose: () => {} };
  });
  const calls: string[] = [];
  const target = {
    drop: () => { calls.push("drop"); },
    createTemplate: () => { calls.push("createTemplate"); },
    grandTemplate: () => { calls.push("grandTemplate"); },
    changePasswordTemplate: () => { calls.push("changePasswordTemplate"); },
  };

  await handlers.get("mysql.delete.event")?.(target);
  await handlers.get("mysql.template.new")?.(target);
  await handlers.get("mysql.user.grant")?.(target);
  await handlers.get("mysql.change.user")?.(target);
  await handlers.get("mysql.template.user")?.(target);
  await handlers.get("mysql.delete.user")?.(target);

  assert.deepEqual(calls, [
    "drop",
    "createTemplate",
    "grandTemplate",
    "changePasswordTemplate",
    "createTemplate",
    "drop",
  ]);
  const summary = summarizeTargetCommands();
  for (const command of [
    "mysql.delete.event",
    "mysql.template.new",
    "mysql.user.grant",
    "mysql.change.user",
    "mysql.template.user",
    "mysql.delete.user",
  ]) {
    assert.equal(summary.genericRouteIds.includes(command), false, command);
    assert.equal(summary.pendingIds.includes(command), false, command);
    assert.equal(summary.capabilities.find((item) => item.command === command)?.kind, "recovered-node", command);
  }
});

test("package commands no longer use a generic utility route", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  registerTargetCommands((id, handler) => {
    handlers.set(id, handler as (...args: unknown[]) => unknown);
    return { dispose: () => {} };
  });
  const calls: string[] = [];
  const target = {
    showSource: () => { calls.push("showSource"); },
    drop: () => { calls.push("drop"); },
  };

  await handlers.get("mysql.package.source")?.(target);
  await handlers.get("mysql.package.drop")?.(target);

  assert.deepEqual(calls, ["showSource", "drop"]);
  const summary = summarizeTargetCommands();
  assert.equal(summary.genericRouteIds.length, 0);
  assert.equal(summary.pendingIds.includes("mysql.package.source"), false);
  assert.equal(summary.pendingIds.includes("mysql.package.drop"), false);
  assert.equal(summary.capabilities.find((item) => item.command === "mysql.package.source")?.kind, "recovered-node");
  assert.equal(summary.capabilities.find((item) => item.command === "mysql.package.drop")?.kind, "recovered-node");
});

test("target command dispatcher routes editor commands through the modern host", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const calls: unknown[][] = [];
  const host: ModernCommandHost = {
    refresh: (...args) => { calls.push(["refresh", ...args]); },
    refreshAll: () => { calls.push(["refreshAll"]); },
    openConnection: async (...args) => { calls.push(["openConnection", ...args]); },
    openConsole: async () => { calls.push(["openConsole"]); },
    runSql: async (...args) => { calls.push(["runSql", ...args]); },
    openQuery: async (...args) => { calls.push(["openQuery", ...args]); },
    createNode: async (...args) => { calls.push(["createNode", ...args]); },
    openHistory: async (...args) => { calls.push(["openHistory", ...args]); },
    clearHistory: () => { calls.push(["clearHistory"]); },
  };
  registerTargetCommands(
    (id, handler) => {
      handlers.set(id, handler as (...args: unknown[]) => unknown);
      return { dispose: () => {} };
    },
    undefined,
    host,
  );

  await handlers.get("mysql.runSQL")?.("select 1");
  await handlers.get("mysql.connection.add")?.();
  assert.deepEqual(calls, [
    ["runSql", "select 1"],
    ["openConnection", "create"],
  ]);
});

test("target query commands use the saved-query host boundary", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const calls: unknown[][] = [];
  const host: ModernCommandHost = {
    refresh: () => {},
    refreshAll: () => {},
    openConnection: async () => {},
    openConsole: async () => {},
    runSql: async () => {},
    openQuery: async () => {},
    createNode: async () => {},
    openHistory: async () => {},
    clearHistory: () => {},
    addQuery: async (...args) => { calls.push(["add", ...args]); },
    linkQueryFolder: async (...args) => { calls.push(["link", ...args]); },
    renameQuery: async (...args) => { calls.push(["rename", ...args]); },
    deleteQuery: async (...args) => { calls.push(["delete", ...args]); },
    mongoDump: async (...args) => { calls.push(["mongoDump", ...args]); },
    mongoRestore: async (...args) => { calls.push(["mongoRestore", ...args]); },
  };
  registerTargetCommands(
    (id, handler) => {
      handlers.set(id, handler as (...args: unknown[]) => unknown);
      return { dispose: () => {} };
    },
    undefined,
    host,
  );

  const target = { connection: { id: "db-1", type: "MySQL" } };
  await handlers.get("mysql.query.add")?.(target);
  await handlers.get("mysql.query.book.add")?.(target);
  await handlers.get("mysql.query.link")?.(target);
  await handlers.get("mysql.query.rename")?.(target);
  await handlers.get("mysql.query.delete")?.(target);
  await handlers.get("mysql.mongo.dump")?.(target);
  await handlers.get("mysql.mongo.restore")?.(target);

  assert.deepEqual(calls, [
    ["add", target, false],
    ["add", target, true],
    ["link", target],
    ["rename", target],
    ["delete", target],
    ["mongoDump", target],
    ["mongoRestore", target],
  ]);
  const summary = summarizeTargetCommands();
  assert.equal(summary.genericRouteIds.includes("mysql.query.link"), false);
  assert.equal(summary.semanticReviewIds.includes("mysql.query.add"), false);
  assert.equal(summary.pendingIds.includes("mysql.query.delete"), false);
  assert.equal(summary.genericRouteIds.includes("mysql.mongo.dump"), false);
  assert.equal(summary.pendingIds.includes("mysql.mongo.restore"), false);
});

test("target dump commands open the manager dump tab with the selected connection", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const calls: unknown[][] = [];
  const host: ModernCommandHost = {
    refresh: () => {},
    refreshAll: () => {},
    openConnection: async () => {},
    openConsole: async () => {},
    runSql: async () => {},
    openQuery: async () => {},
    createNode: async () => {},
    openHistory: async () => {},
    clearHistory: () => {},
    openUtility: async (...args) => {
      calls.push(args);
    },
  };
  registerTargetCommands(
    (id, handler) => {
      handlers.set(id, handler as (...args: unknown[]) => unknown);
      return { dispose: () => {} };
    },
    undefined,
    host,
  );

  const connection = { id: "db-1", type: "MySQL" };
  const treeTarget = { connection, name: "selected-database" };
  await handlers.get("mysql.data.dump")?.(treeTarget);
  await handlers.get("mysql.struct.dump")?.(treeTarget);

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.[0], "manager");
  assert.equal(calls[0]?.[1], "Data Export");
  assert.deepEqual(calls[0]?.[2], {
    connection,
    name: "selected-database",
    openDump: true,
  });
  assert.equal(calls[1]?.[0], "manager");
  assert.equal(calls[1]?.[1], "Structure Export");
  assert.equal((calls[1]?.[2] as Record<string, unknown>).openDump, true);

  const elasticCalls: unknown[] = [];
  const elasticTarget = {
    connection: { id: "es-1", type: "ElasticSearch" },
    dump: (options: unknown) => {
      elasticCalls.push(options);
      return "elastic-dump";
    },
  };
  assert.equal(await handlers.get("mysql.data.dump")?.(elasticTarget), "elastic-dump");
  assert.equal(await handlers.get("mysql.struct.dump")?.(elasticTarget), "elastic-dump");
  assert.deepEqual(elasticCalls, [{ withData: true }, { withData: false }]);
  assert.equal(calls.length, 2);
});

test("target-specific utility commands use dedicated modern routes", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const calls: unknown[][] = [];
  const host: ModernCommandHost = {
    refresh: () => {},
    refreshAll: () => {},
    openConnection: async () => {},
    openConsole: async () => {},
    runSql: async () => {},
    openQuery: async () => {},
    createNode: async () => {},
    openHistory: async () => {},
    clearHistory: () => {},
    openUtility: async (...args) => {
      calls.push(args);
    },
    runMock: async (...args) => {
      calls.push(["runMock", ...args]);
    },
    fullTextSearch: async (...args) => {
      calls.push(["fullTextSearch", ...args]);
    },
  };
  registerTargetCommands(
    (id, handler) => {
      handlers.set(id, handler as (...args: unknown[]) => unknown);
      return { dispose: () => {} };
    },
    undefined,
    host,
  );

  const target = { connection: { id: "db-1", type: "MySQL" } };
  await handlers.get("mysql.struct.diff")?.(target);
  await handlers.get("mysql.mock.run")?.(target);
  await handlers.get("mysql.file.manager")?.(target);
  await handlers.get("mysql.table.fullTextSearch")?.(target);

  assert.deepEqual(calls, [
    ["structDiff", "Structure Diff", target],
    ["runMock", target],
    ["fileManager", "File Manager", target],
    ["fullTextSearch", target],
  ]);
  const summary = summarizeTargetCommands();
  for (const command of [
    "mysql.struct.diff",
    "mysql.mock.run",
    "mysql.data.dump",
    "mysql.struct.dump",
    "mysql.file.manager",
    "mysql.table.fullTextSearch",
  ]) {
    assert.equal(summary.genericRouteIds.includes(command), false, command);
    assert.equal(summary.pendingIds.includes(command), false, command);
    assert.equal(summary.capabilities.find((item) => item.command === command)?.kind, "direct-host", command);
  }
});

test("unsupported conditional node capabilities fail explicitly at the dispatch boundary", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  registerTargetCommands((id, handler) => {
    handlers.set(id, handler as (...args: unknown[]) => unknown);
    return { dispose: () => {} };
  });
  await assert.rejects(
    Promise.resolve().then(() => handlers.get("mysql.db.truncate")?.({})),
    (error: unknown) =>
      error instanceof SourceRecoveryPendingError &&
      error.code === "source-recovery-pending",
  );
  const summary = summarizeTargetCommands();
  assert.equal(summary.commandIds.length, TARGET_COMMAND_IDS.length);
  assert.equal(summary.genericRouteIds.includes("mysql.struct.diff"), false);
  assert.equal(summary.semanticReviewIds.includes("mysql.table.fullTextSearch"), false);
  assert.equal(summary.genericRouteIds.length, 0);
  assert.ok(summary.conditionalIds.includes("mysql.db.drop"));
  assert.equal(summary.pendingIds.includes("mysql.table.fullTextSearch"), false);
  assert.equal(summary.capabilities.length, TARGET_COMMAND_IDS.length);
});
