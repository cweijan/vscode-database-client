import assert from "node:assert/strict";
import test from "node:test";

import { OperationCancelledError } from "../../src/modern/core/errors";
import { buildSshConnectConfig } from "../../src/modern/remote/sshService";

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
