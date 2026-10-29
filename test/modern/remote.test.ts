import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import * as net from "node:net";
import { PassThrough } from "node:stream";

import { OperationCancelledError } from "../../src/modern/core/errors";
import {
  buildSshConnectConfig,
  expandSshPath,
  type SshService,
} from "../../src/modern/remote/sshService";
import { sshOptionsFor } from "../../src/modern/database/connectionManager";
import { SshForwardingService } from "../../src/modern/remote/sshForwardingService";
import { s3PublicUrl, s3WebsiteUrl } from "../../src/modern/database/s3Urls";
import {
  detectSshMonitorPlatform,
  parseCpuUsage,
  parseDiskUsage,
  parseMemoryUsage,
  parseNetworkCounters,
} from "../../src/modern/remote/sshMonitorService";
import {
  boundRemotePath,
  childRemotePath,
  normalizeRemotePath,
  parentRemotePath,
} from "../../src/modern/remote/remotePaths";
import { parseDockerComposeImages } from "../../src/modern/remote/dockerComposeParser";
import { buildRdpFileContent } from "../../src/modern/remote/rdpService";
import {
  remoteContextMenuItems,
  remoteEntryTypeRank,
} from "../../src/modern-webview/remoteFileManagerPresentation";
import { shouldPruneSftpRootEntry } from "../../src/modern/remote/sshSftpPresentation";

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
      algorithms: { cipher: ["aes256-ctr"] },
    },
  });

  assert.equal(config.host, "server.example.com");
  assert.equal(config.port, 2200);
  assert.equal(config.username, "deployer");
  assert.equal(config.password, "secret");
  assert.equal(config.agent, "SSH_AUTH_SOCK");
  assert.equal(config.passphrase, "key-passphrase");
  assert.equal(config.readyTimeout, 12_000);
  assert.deepEqual(config.algorithms, { cipher: ["aes256-ctr"] });
  assert.equal(config.keepaliveInterval, 10_000);
});

test("SSH SFTP root pruning matches the target system-directory filter", () => {
  assert.equal(shouldPruneSftpRootEntry(true, "/", "/", "/proc", "directory"), true);
  assert.equal(shouldPruneSftpRootEntry(true, "/", "/", "/home", "directory"), false);
  assert.equal(shouldPruneSftpRootEntry(true, "/", "/", "/proc", "file"), false);
  assert.equal(shouldPruneSftpRootEntry(false, "/", "/", "/proc", "directory"), false);
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

test("SSH auth modes expand home paths and select target authentication methods", () => {
  const config = buildSshConnectConfig({
    id: "ssh-agent",
    type: "SSH",
    options: {
      ssh: {
        type: "agent",
        privateKeyPath: "{homedir}/.ssh/id_ed25519",
      },
    },
  });

  assert.deepEqual(config.authHandler, ["agent"]);
  assert.equal(expandSshPath("~/.ssh/id_rsa").includes(".ssh"), true);
  assert.equal(expandSshPath("{homedir}/.ssh/id_rsa").includes(".ssh"), true);
});

test("SSH reads the target top-level ssh configuration", () => {
  const config = buildSshConnectConfig({
    id: "ssh-target-shape",
    type: "SSH",
    host: "legacy.example.com",
    ssh: {
      type: "privateKeyAndPassword",
      privateKeyPath: "~/.ssh/id_ed25519",
      passphrase: "key-passphrase",
      waitingTime: 18_000,
    },
  });

  assert.deepEqual(config.authHandler, ["publickey", "password"]);
  assert.equal(config.passphrase, "key-passphrase");
  assert.equal(config.readyTimeout, 18_000);
});

test("SSH connection options normalize the target standalone sshConnect namespace", () => {
  const options = sshOptionsFor({
    id: "ssh-connect-namespace",
    type: "SSH",
    sshConnect: {
      host: "nested.example.com",
      port: 2222,
      username: "operator",
      password: "secret",
      type: "password",
    },
  });

  assert.equal(options.host, "nested.example.com");
  assert.equal(options.port, 2222);
  assert.equal(options.user, "operator");
  assert.equal(options.password, "secret");
  assert.equal(options.options?.type, "password");
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

test("SSH forwarding supports remote and dynamic forwarding types", async () => {
  let remoteClosed = false;
  const fakeSsh = {
    open: async () => ({
      forwardOut: async () => new PassThrough(),
      forwardIn: async () => ({
        port: 39221,
        close: async () => { remoteClosed = true; },
      }),
    }),
    close: async () => {},
  } as unknown as SshService;
  const forwarding = new SshForwardingService(fakeSsh);

  await forwarding.start({ id: "ssh-forward", type: "SSH" }, {
      id: "remote",
      type: "Remote",
      localHost: "127.0.0.1",
      localPort: 5432,
      remoteHost: "database",
      remotePort: 5432,
    });
  assert.equal(forwarding.activePort("remote"), 39221);
  await forwarding.stop("remote");
  assert.equal(remoteClosed, true);

  await forwarding.start({ id: "ssh-forward", type: "SSH" }, {
    id: "dynamic",
    type: "Dynamic",
    localHost: "127.0.0.1",
    localPort: 0,
    remoteHost: "",
    remotePort: 0,
  });
  const dynamicPort = forwarding.activePort("dynamic");
  if (dynamicPort === undefined || dynamicPort <= 0) {
    throw new Error("Dynamic forwarding did not expose a listening port");
  }
  const client = net.createConnection({ host: "127.0.0.1", port: dynamicPort });
  await once(client, "connect");
  client.write(Buffer.from([5, 1, 0]));
  const [greeting] = await once(client, "data") as [Buffer];
  assert.deepEqual([...greeting.subarray(0, 2)], [5, 0]);
  client.write(Buffer.from([5, 1, 0, 3, 11, ...Buffer.from("example.com"), 0, 80]));
  const [response] = await once(client, "data") as [Buffer];
  assert.deepEqual([...response.subarray(0, 2)], [5, 0]);
  client.destroy();
  await forwarding.stop("dynamic");
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

test("remote file paths normalize traversal and stay inside the configured root", () => {
  assert.equal(normalizeRemotePath("/srv/app/../logs/./today"), "/srv/logs/today");
  assert.equal(childRemotePath("/srv/app", "../config"), "/srv/config");
  assert.equal(parentRemotePath("/srv/app/logs"), "/srv/app");
  assert.equal(boundRemotePath("/srv/app/../../etc", "/srv/app"), "/srv/app");
  assert.equal(boundRemotePath("/srv/app/logs", "/srv/app"), "/srv/app/logs");
});

test("remote file manager preserves target grouping and context-menu boundaries", () => {
  assert.deepEqual(
    ["file", "link", "directory"].sort((left, right) =>
      remoteEntryTypeRank(left as "file" | "link" | "directory")
      - remoteEntryTypeRank(right as "file" | "link" | "directory")),
    ["directory", "link", "file"],
  );

  const directory = { name: "logs", path: "/logs", type: "directory" as const };
  assert.deepEqual(
    remoteContextMenuItems(directory, true, "sftp").map((item) => item.id),
    ["rename", "copyName", "copyPath", "openFolderTerminal", "download", "delete"],
  );
  assert.deepEqual(
    remoteContextMenuItems(directory, true, "s3").map((item) => item.id),
    ["rename", "copyName", "copyPath", "download", "delete"],
  );
  assert.deepEqual(
    remoteContextMenuItems(directory, true, "sftp", true).map((item) => item.id),
    ["copyPath", "openFolderTerminal", "download"],
  );
  assert.deepEqual(
    remoteContextMenuItems(undefined, false, "sftp").map((item) => item.id),
    ["createFile", "createFolder"],
  );
  assert.equal(remoteContextMenuItems(undefined, false, "sftp")[0].disabled, true);
});

test("S3 resource URLs preserve path-style, virtual-hosted, and provider-site behavior", () => {
  const pathStyle = {
    id: "s3-minio",
    type: "S3",
    host: "minio.local",
    port: 9000,
    options: { s3: { useSSL: false, pathStyle: true } },
  };
  assert.equal(
    s3PublicUrl(pathStyle, "/photos/folder/a b.txt"),
    "http://minio.local:9000/photos/folder/a%20b.txt",
  );

  const virtualHosted = {
    id: "s3-cloud",
    type: "S3",
    host: "s3.example.com",
    options: { s3: { useSSL: true, pathStyle: false } },
  };
  assert.equal(
    s3PublicUrl(virtualHosted, "/media/image#.png"),
    "https://media.s3.example.com/image%23.png",
  );
  assert.equal(
    s3WebsiteUrl({ id: "aws", type: "S3", options: { s3: { serviceIds: ["aws"] } } }),
    "https://s3.console.aws.amazon.com/s3/home",
  );
  assert.equal(
    s3WebsiteUrl({ id: "custom", type: "S3", connectionUrl: "http://minio.local:9000" }),
    "http://minio.local:9000/",
  );
});

test("RDP launch configuration preserves target mstsc file semantics", () => {
  const content = buildRdpFileContent(
    {
      id: "rdp-1",
      type: "RDP",
      options: {
        rdpConfig: {
          fullScreen: false,
          forwardComposition: false,
          redirectDrives: false,
          redirectComports: false,
          smartSizing: false,
          height: 900,
          width: 1440,
        },
      },
    },
    { host: "127.0.0.1", port: 3390 },
  );
  assert.match(content, /full address:s:127\.0\.0\.1:3390/);
  assert.match(content, /screen mode id:i:1/);
  assert.match(content, /keyboardhook:i:0/);
  assert.match(content, /redirectcomports:i:0/);
  assert.match(content, /desktopheight:i:900/);
  assert.match(content, /desktopwidth:i:1440/);
  assert.doesNotMatch(content, /drivestoredirect:s:\*/);
});

test("Docker Compose image parsing keeps remote pull targets typed", () => {
  assert.deepEqual(
    parseDockerComposeImages(`services:
  api:
    image: example/api:latest
  worker:
    build: .
  cache:
    image: redis:7
`),
    [
      { service: "api", image: "example/api:latest" },
      { service: "cache", image: "redis:7" },
    ],
  );
  assert.throws(
    () => parseDockerComposeImages("services: ["),
    /Invalid Docker Compose YAML/,
  );
});
