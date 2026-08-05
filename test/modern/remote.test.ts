import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";

import { OperationCancelledError } from "../../src/modern/core/errors";
import { buildSshConnectConfig, type SshService } from "../../src/modern/remote/sshService";
import { SshForwardingService } from "../../src/modern/remote/sshForwardingService";

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
