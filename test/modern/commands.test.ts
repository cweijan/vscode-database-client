import assert from "node:assert/strict";
import test from "node:test";

import { SourceRecoveryPendingError } from "../../src/modern/core/errors";
import {
  registerTargetCommands,
  summarizeTargetCommands,
} from "../../src/modern/commands/targetCommandDispatcher";
import { TARGET_COMMAND_IDS } from "../../src/modern/commands/manifestCommands";
import type { ModernCommandHost } from "../../src/modern/commands/modernCommandHost";

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

test("unrecovered node capabilities fail explicitly at the dispatch boundary", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  registerTargetCommands((id, handler) => {
    handlers.set(id, handler as (...args: unknown[]) => unknown);
    return { dispose: () => {} };
  });
  await assert.rejects(
    Promise.resolve().then(() => handlers.get("mysql.package.source")?.({})),
    (error: unknown) =>
      error instanceof SourceRecoveryPendingError &&
      error.code === "source-recovery-pending",
  );
  const summary = summarizeTargetCommands();
  assert.equal(summary.commandIds.length, TARGET_COMMAND_IDS.length);
  assert.ok(summary.genericRouteIds.includes("mysql.struct.diff"));
  assert.ok(summary.semanticReviewIds.includes("mysql.table.fullTextSearch"));
  assert.ok(summary.conditionalIds.includes("mysql.db.drop"));
  assert.ok(summary.pendingIds.includes("mysql.table.fullTextSearch"));
  assert.equal(summary.capabilities.length, TARGET_COMMAND_IDS.length);
});
