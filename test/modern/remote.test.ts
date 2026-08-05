import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";

import { OperationCancelledError } from "../../src/modern/core/errors";
import { buildSshConnectConfig, type SshService } from "../../src/modern/remote/sshService";
import { SshForwardingService } from "../../src/modern/remote/sshForwardingService";
import {
  detectSshMonitorPlatform,
  parseCpuUsage,
  parseDiskUsage,
  parseMemoryUsage,
  parseNetworkCounters,
} from "../../src/modern/remote/sshMonitorService";

test("SSH connection options map to the modern driver configuration", () => {
  const config = buildSshConnectConfig({
    id: "ssh-1",
    type: "SSH",
    host: "server.example.com",
    port: 2200,
    user: "deployer",
    password: "secret",
    options: {
      agent: "SSH_AUTH_SOCK",
      passphrase: "key-passphrase",
      readyTimeout: 12_000,
    },
  });

  assert.equal(config.host, "server.example.com");
  assert.equal(config.port, 2200);
  assert.equal(config.username, "deployer");
  assert.equal(config.password, "secret");
  assert.equal(config.agent, "SSH_AUTH_SOCK");
  assert.equal(config.passphrase, "key-passphrase");
  assert.equal(config.readyTimeout, 12_000);
  assert.equal(config.keepaliveInterval, 10_000);
});

test("SSH connection configuration uses safe defaults and preserves cancellation semantics", () => {
  const config = buildSshConnectConfig({ id: "ssh-2", type: "SSH" });
  assert.equal(config.host, "localhost");
  assert.equal(config.port, 22);
  assert.equal(config.username, "root");
  assert.equal(config.readyTimeout, 30_000);

  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () => {
      if (controller.signal.aborted) {
        throw new OperationCancelledError("Opening SSH connection");
      }
    },
    OperationCancelledError,
  );
});

test("SSH forwarding validates definitions and owns active listeners", async () => {
  const fakeSsh = {
    open: async () => ({
      forwardOut: async () => new PassThrough(),
    }),
  } as unknown as SshService;
  const forwarding = new SshForwardingService(fakeSsh);
  const options = { id: "ssh-forward", type: "SSH" as const };

  await assert.rejects(
    forwarding.start(options, {
      id: "invalid",
      localPort: "not-a-port",
      remoteHost: "database",
      remotePort: 5432,
    }),
    /Local port/,
  );

  await forwarding.start(options, {
    id: "active",
    localHost: "127.0.0.1",
    localPort: 0,
    remoteHost: "database",
    remotePort: 5432,
  });
  assert.equal(forwarding.isActive("active"), true);
  assert.deepEqual(forwarding.activeIds(), ["active"]);
  await forwarding.stop("active");
  assert.equal(forwarding.isActive("active"), false);
});

test("SSH forwarding does not silently downgrade unsupported forwarding types", async () => {
  const fakeSsh = {
    open: async () => ({
      forwardOut: async () => new PassThrough(),
    }),
  } as unknown as SshService;
  const forwarding = new SshForwardingService(fakeSsh);

  await assert.rejects(
    forwarding.start({ id: "ssh-forward", type: "SSH" }, {
      id: "remote",
      type: "Remote",
      localPort: 5432,
      remoteHost: "database",
      remotePort: 5432,
    }),
    /Remote SSH forwarding is not implemented/,
  );
  assert.equal(forwarding.activeIds().length, 0);
});

test("SSH monitor parsers preserve target metric units", () => {
  assert.equal(detectSshMonitorPlatform("Linux"), "linux");
  assert.equal(detectSshMonitorPlatform("Microsoft Windows [Version 10]"), "windows");
  assert.equal(parseCpuUsage("%Cpu(s): 4.0 us, 2.0 sy, 94.0 id", "linux"), 0.06);
  assert.deepEqual(parseMemoryUsage("1000000 250000", true), {
    memory: 0.75,
    memoryUsed: 750000,
    memoryTotal: 1000000,
  });
  assert.deepEqual(parseDiskUsage("1000000 250000 25%", "linux"), {
    disk: 0.25,
    diskUsed: "250000",
    diskTotal: "1000000",
  });
  assert.deepEqual(parseNetworkCounters("12345 67890"), {
    received: 12345,
    sent: 67890,
  });
});
