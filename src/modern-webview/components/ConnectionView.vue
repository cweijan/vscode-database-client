<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import { createTranslator } from "../i18n";
import {
  ElColorPicker,
  ElInput,
  ElPopover,
  ElRadio,
  ElRadioGroup,
} from "element-plus";

import ConnectionDialog from "./ConnectionDialog.vue";
import ServiceSelector from "./ServiceSelector.vue";
import PasswordInput from "./target/PasswordInput.vue";
import ConnectResult from "./target/ConnectResult.vue";
import { connectResult } from "../connectState";
import { usePayState } from "../license";
import UiInput from "./UiInput.vue";
import UiSelect from "./UiSelect.vue";

interface ConnectionForm {
  id: string;
  name: string;
  group: string;
  color: string;
  type: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  schema: string;
  connectionUrl: string;
  dbPath: string;
  socketPath: string;
  caPath: string;
  clientCertPath: string;
  clientKeyPath: string;
  includeDatabases: string;
  connectTimeout: string;
  requestTimeout: string;
  timezone: string;
  global: boolean;
  authType: string;
  authSource: string;
  useSSL: boolean;
  disableTLSVerification: boolean;
  useConnectionString: boolean;
  srv: boolean;
  usingSSH: boolean;
  ssh: {
    host: string;
    port: string;
    username: string;
    user?: string;
    type: string;
    password: string;
    privateKeyPath: string;
    passphrase: string;
    waitingTime: string;
    cipher: string;
    serverType: string;
    shell: string;
    ftpRoot: string;
    pruneSFTPRoot: boolean;
    showHidden?: boolean;
    fs?: {
      showHidden?: boolean;
    };
    showHiddenFiles: boolean;
    agentPath: string;
  };
  redisConfig: {
    databaseNumber: string;
    totalKeyCount: string;
    allDatabase: boolean;
    cluster: boolean;
    stack: boolean;
  };
  advance: {
    loadMetaDataWhenExpandTreeView: boolean;
    groupingTables: boolean;
    groupingThreshold: string;
    hideSystemSchema: boolean | "recommended";
    excludedSchemas: string;
    excludedDatabases: string;
    usingCustomDatabaseName: boolean;
    defaultSelectLimit: string;
    autoDescendingColumns: string;
    customTerminalCommand: string;
    startupSQL: string;
    compatibleMode: boolean;
  };
  rdpConfig: {
    fullScreen: boolean;
    smartSizing: boolean;
    redirectDrives: boolean;
    forwardComposition: boolean;
  };
  optionsText: string;
  options?: Record<string, unknown>;
}

interface ServerChoice {
  readonly type: string;
  readonly label: string;
  readonly icon: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const initialRecord = objectRecord(bootstrap.state.connection);
const initial = {
  ...initialRecord,
  type: initialRecord.type ?? initialRecord.dbType,
} as Partial<ConnectionForm>;
const initialOptions = objectRecord(initialRecord.options);
const initialAdvance = objectRecord(
  initialRecord.advance ?? initialOptions.advance,
);
function initialValue<T>(key: string, fallback: T): T {
  const value = initialRecord[key] ?? initialOptions[key];
  return value === undefined ? fallback : value as T;
}
const initialSsh = objectRecord(
  initialRecord.ssh ?? initialRecord.sshConnect ?? initialOptions.ssh,
) as Partial<ConnectionForm["ssh"]>;
const initialRdp = objectRecord(
  initialRecord.rdpConfig ?? initialOptions.rdpConfig,
) as Partial<ConnectionForm["rdpConfig"]>;
const initialRedis = objectRecord(
  initialRecord.redis ?? initialOptions.redis,
) as Partial<ConnectionForm["redisConfig"]>;
function optionValue<T>(key: string, fallback: T): T {
  return initialValue(key, fallback);
}
const form = reactive<ConnectionForm>({
  id: initial.id ?? "connection-" + Date.now(),
  name: initial.name ?? "",
  group: initial.group ?? "",
  color: initial.color ?? "",
  type: initial.type ?? "MySQL",
  host: initial.host ?? (initial.type === "SSH" ? initialSsh.host : undefined) ?? "localhost",
  port: initial.port == null
    ? initial.type === "SSH" ? String(initialSsh.port ?? 22) : ""
    : String(initial.port),
  user: initial.user ?? (initial.type === "SSH" ? initialSsh.username ?? initialSsh.user : undefined) ?? "",
  password: initial.password ?? (initial.type === "SSH" ? initialSsh.password : undefined) ?? "",
  database: initial.database ?? "",
  schema: initial.schema ?? "",
  connectionUrl: initial.connectionUrl ?? "",
  dbPath: initial.dbPath ?? "",
  socketPath: initial.socketPath ?? String(optionValue("socketPath", "")),
  caPath: String(optionValue("caPath", "")),
  clientCertPath: String(optionValue("clientCertPath", "")),
  clientKeyPath: String(optionValue("clientKeyPath", "")),
  includeDatabases: String(optionValue("includeDatabases", "")),
  connectTimeout: String(optionValue("connectTimeout", "30000")),
  requestTimeout: String(optionValue("requestTimeout", "10000")),
  timezone: String(optionValue("timezone", "+00:00")),
  global: initial.global !== false,
  authType: String(optionValue("authType", "default")),
  authSource: String(optionValue("authSource", "")),
  useSSL: Boolean(optionValue("useSSL", optionValue("ssl", false))),
  disableTLSVerification: Boolean(optionValue("disableTLSVerification", false)),
  useConnectionString: Boolean(optionValue("useConnectionString", Boolean(initial.connectionUrl))),
  srv: Boolean(optionValue("srv", false)),
  usingSSH: Boolean(optionValue("usingSSH", false)),
  ssh: {
    host: String(initialSsh.host ?? ""),
    port: String(initialSsh.port ?? 22),
    username: String(initialSsh.username ?? initialSsh.user ?? "root"),
    type: String(initialSsh.type ?? "auto"),
    password: String(initialSsh.password ?? ""),
    privateKeyPath: String(initialSsh.privateKeyPath ?? optionValue("privateKeyPath", "")),
    passphrase: String(initialSsh.passphrase ?? optionValue("passphrase", "")),
    waitingTime: String(initialSsh.waitingTime ?? optionValue("readyTimeout", "30000")),
    cipher: String(initialSsh.cipher ?? ""),
    serverType: String(initialSsh.serverType ?? "linux"),
    shell: String(initialSsh.shell ?? ""),
    ftpRoot: String(initialSsh.ftpRoot ?? "/"),
    pruneSFTPRoot: initialSsh.pruneSFTPRoot === true,
    showHiddenFiles: initialSsh.showHidden !== false
      && initialSsh.showHiddenFiles !== false
      && initialSsh.fs?.showHidden !== false,
    agentPath: String(initialSsh.agentPath ?? optionValue("agent", "")),
  },
  redisConfig: {
    databaseNumber: String(initialRedis.databaseNumber ?? 16),
    totalKeyCount: String(initialRedis.totalKeyCount ?? 10000),
    allDatabase: initialRedis.allDatabase === true,
    cluster: initialRedis.cluster === true,
    stack: initialRedis.stack === true,
  },
  advance: {
    loadMetaDataWhenExpandTreeView: initialAdvance.loadMetaDataWhenExpandTreeView !== false,
    groupingTables: initialAdvance.groupingTables === true,
    groupingThreshold: String(initialAdvance.groupingThreshold ?? 50),
    hideSystemSchema: initialAdvance.hideSystemSchema === false ? false : "recommended",
    excludedSchemas: String(initialAdvance.excludedSchemas ?? ""),
    excludedDatabases: String(initialAdvance.excludedDatabases ?? ""),
    usingCustomDatabaseName: initialAdvance.usingCustomDatabaseName === true,
    defaultSelectLimit: String(initialAdvance.defaultSelectLimit ?? 1000),
    autoDescendingColumns: String(initialAdvance.autoDescendingColumns ?? ""),
    customTerminalCommand: String(initialAdvance.customTerminalCommand ?? ""),
    startupSQL: String(initialAdvance.startupSQL ?? ""),
    compatibleMode: initialAdvance.compatibleMode === true,
  },
  rdpConfig: {
    fullScreen: initialRdp.fullScreen !== false,
    smartSizing: initialRdp.smartSizing !== false,
    redirectDrives: initialRdp.redirectDrives !== false,
    forwardComposition: initialRdp.forwardComposition !== false,
  },
  optionsText: initial.options ? JSON.stringify(initial.options, null, 2) : "",
});
const message = ref("");
const translator = createTranslator(readWebviewBootstrap().language);
const isPay = usePayState();
const groupVisible = ref(false);
const connectionGroups = ref<string[]>([]);
const showTrinoWarning = computed(
  () => form.type === "Trino",
);
const advanceVisible = ref(false);
const redisAdvanceVisible = ref(false);
const sslVisible = ref(false);
const sshAdvanceVisible = ref(false);
let resultSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

const coreConnectionDefaults: Record<string, { port: number; user: string; database: string }> = {
  MySQL: { port: 3306, user: "root", database: "" },
  MariaDB: { port: 3306, user: "root", database: "" },
  PostgreSQL: { port: 5432, user: "postgres", database: "postgres" },
  Oracle: { port: 1521, user: "system", database: "XE" },
  Redis: { port: 6379, user: "", database: "0" },
  SSH: { port: 22, user: "root", database: "" },
  RDP: { port: 3389, user: "", database: "" },
};

const coreServerIcons: Record<string, string> = {
  MySQL: "mysql_dark.svg",
  MariaDB: "mariadb.svg",
  PostgreSQL: "postgresql.svg",
  Oracle: "oracle.png",
  Redis: "redis.png",
  SSH: "gnu.svg",
  RDP: "rdp.png",
};

const coreServerRows: readonly (readonly (readonly ServerChoice[])[])[] = [
  [
    [
      { type: "MySQL", label: "MySQL", icon: "mysql_dark.svg" },
      { type: "MariaDB", label: "MariaDB", icon: "mariadb.svg" },
      { type: "PostgreSQL", label: "PostgreSQL", icon: "postgresql.svg" },
    ],
    [
      { type: "SQLite", label: "SQLite", icon: "sqlite.svg" },
      { type: "SqlServer", label: "SQL Server", icon: "sqlserver.svg" },
    ],
    [
      { type: "Db2", label: "Db2", icon: "db2.svg" },
      { type: "Oracle", label: "Oracle", icon: "oracle.png" },
    ],
    [
      { type: "Kingbase", label: "Kingbase", icon: "kingbase.svg" },
      { type: "ClickHouse", label: "ClickHouse", icon: "clickhouse.svg" },
      { type: "JDBC", label: "JDBC", icon: "java.png" },
    ],
  ],
  [
    [
      { type: "SSH", label: "SSH", icon: "gnu.svg" },
      { type: "Docker", label: "Docker", icon: "docker.svg" },
    ],
    [
      { type: "Redis", label: "Redis", icon: "redis.png" },
      { type: "ElasticSearch", label: "Elasticsearch", icon: "elasticsearch.svg" },
      { type: "MongoDB", label: "MongoDB", icon: "mongodb.svg" },
    ],
    [
      { type: "S3", label: "S3", icon: "s3.png" },
      { type: "FTP", label: "FTP", icon: "ftp.png" },
    ],
    [
      { type: "Kafka", label: "Kafka", icon: "kafka.png" },
      { type: "RabbitMQ", label: "RabbitMQ", icon: "rabbitmq.svg" },
      { type: "Cassandra", label: "Cassandra", icon: "cassandra.svg" },
    ],
  ],
];

const coreServerGroups = coreServerRows.flat();

const selectorGroups = [
  { choices: coreServerRows[0].flat() },
  { choices: coreServerRows[1].flat(), more: true },
] as const;

const moreServerTypes = [
  "DuckDB",
  "libSQL",
  "D1",
  "AzureSQLServer",
  "Hive",
  "Redshift",
  "CockroachDB",
  "Athena",
  "BigQuery",
  "Snowflake",
  "Databricks",
  "DMDB",
  "GaussDB",
  "TDengine",
  "Doris",
  "Trino",
  "PrestoDB",
  "Loki",
  "etcd",
  "WebDAV",
  "Zookeeper",
] as const;

const coreServerTypes = new Set(
  coreServerGroups.flat().map((choice) => choice.type),
);

const serverIconFiles: Record<string, string> = {
  ...coreServerIcons,
  Doris: "doris.svg",
  Redshift: "redshift.svg",
  GaussDB: "gaussdb.svg",
  SqlServer: "sqlserver.svg",
  AzureSQLServer: "azure.svg",
  Db2: "db2.svg",
  "Db2 for i": "db2.svg",
  MySQLCompatible: "mysql.svg",
  PostgreCompatible: "postgresql.svg",
  SQLite: "sqlite.svg",
  DuckDB: "duckdb.svg",
  Databricks: "databricks.svg",
  D1: "d1.svg",
  libSQL: "libsql.svg",
  Kingbase: "kingbase.svg",
  Cockroach: "cockroach.svg",
  达梦: "dm.png",
  TDengine: "tdengine.svg",
  Trino: "trino.png",
  PrestoDB: "presto.svg",
  Hive: "hive.svg",
  ClickHouse: "clickhouse.svg",
  Snowflake: "snowflake.svg",
  Athena: "athena.svg",
  BigQuery: "bigquery.svg",
  JDBC: "java.png",
  MongoDB: "mongodb.svg",
  ElasticSearch: "elasticsearch.svg",
  Redis: "redis.png",
  Kafka: "kafka.png",
  RabbitMQ: "rabbitmq.svg",
  SSH: "gnu.svg",
  FTP: "ftp.png",
  S3: "s3.png",
  Docker: "docker.svg",
  WebDAV: "webdav.png",
  Neo4j: "neo4j.png",
  RDP: "rdp.png",
  Loki: "loki.png",
  etcd: "etcd.svg",
  Zookeeper: "zookeeper.png",
  Exasol: "exasol.svg",
};

function webviewAsset(relativePath: string): string {
  const base = bootstrap.config.assetBase;
  if (typeof base === "string" && base.length > 0) {
    try {
      return new URL(relativePath, base.endsWith("/") ? base : `${base}/`).toString();
    } catch {
      // Development bootstrap may use a placeholder instead of a URI.
    }
  }
  return relativePath;
}

function serverIcon(type: string): string {
  const fileName = type.includes(".") ? type : serverIconFiles[type] || "more.png";
  return webviewAsset(`icon/server/${fileName}`);
}

function applyConnectionDefaults(type: string, force = false): void {
  const defaults = coreConnectionDefaults[type];
  if (!defaults) return;
  if (force || !form.port) form.port = String(defaults.port);
  if (force || !form.user) form.user = defaults.user;
  if (force || !form.database) form.database = defaults.database;
}

applyConnectionDefaults(form.type);
watch(() => form.type, (type) => applyConnectionDefaults(type, true));

const databaseTypes = [
  "MySQL",
  "MariaDB",
  "Doris",
  "PostgreSQL",
  "Redshift",
  "GaussDB",
  "Cassandra",
  "Oracle",
  "SqlServer",
  "AzureSQLServer",
  "Db2",
  "Db2 for i",
  "MySQLCompatible",
  "PostgreCompatible",
  "SQLite",
  "DuckDB",
  "Databricks",
  "D1",
  "libSQL",
  "Kingbase",
  "Cockroach",
  "达梦",
  "TDengine",
  "Trino",
  "PrestoDB",
  "Hive",
  "ClickHouse",
  "Snowflake",
  "Athena",
  "BigQuery",
  "JDBC",
  "MongoDB",
  "ElasticSearch",
  "Redis",
  "Kafka",
  "RabbitMQ",
  "SSH",
  "FTP",
  "S3",
  "Docker",
  "WebDAV",
  "Neo4j",
  "RDP",
  "Loki",
  "etcd",
  "Zookeeper",
  "Exasol",
];

const coreConnectionTypes = new Set([
  "MySQL",
  "MariaDB",
  "PostgreSQL",
  "Oracle",
  "Redis",
  "SSH",
  "RDP",
]);

const coreSqlConnectionTypes = new Set([
  "MySQL",
  "MariaDB",
  "PostgreSQL",
  "Oracle",
]);

function isCoreConnectionType(type: string): boolean {
  return coreConnectionTypes.has(type);
}

function isCoreSqlConnectionType(type: string): boolean {
  return coreSqlConnectionTypes.has(type);
}

function buildConnection(): Record<string, unknown> | undefined {
  let options: Record<string, unknown> | undefined;
  if (form.optionsText.trim()) {
    try {
      const parsed: unknown = JSON.parse(form.optionsText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Options must be a JSON object");
      }
      options = parsed as Record<string, unknown>;
    } catch (error) {
      message.value = error instanceof Error ? error.message : "Options JSON is invalid.";
      return undefined;
    }
  }
  const {
    optionsText: _optionsText,
    ssh,
    redisConfig,
    rdpConfig,
    advance,
    ...connectionFields
  } = form;
  const sshConfig = {
    ...ssh,
    agent: ssh.agentPath || undefined,
    showHidden: ssh.showHiddenFiles,
    fs: { showHidden: ssh.showHiddenFiles },
    port: ssh.port ? Number(ssh.port) : undefined,
  };
  const standaloneSshFields = form.type === "SSH"
    ? {
      host: ssh.host || form.host,
      port: sshConfig.port || 22,
      user: ssh.username || form.user,
      password: ssh.password || form.password,
    }
    : {};
  const advanceConfig: Record<string, unknown> = {
    ...advance,
    includeDatabases: form.includeDatabases || undefined,
    groupingThreshold: advance.groupingThreshold
      ? Number(advance.groupingThreshold)
      : undefined,
    defaultSelectLimit: advance.defaultSelectLimit
      ? Number(advance.defaultSelectLimit)
      : undefined,
  };
  const advancedOptions: Record<string, unknown> = {
    ...options,
    socketPath: form.socketPath || undefined,
    includeDatabases: form.includeDatabases || undefined,
    connectTimeout: form.connectTimeout ? Number(form.connectTimeout) : undefined,
    requestTimeout: form.requestTimeout ? Number(form.requestTimeout) : undefined,
    timezone: form.timezone || undefined,
    authType: form.authType || undefined,
    authSource: form.authSource || undefined,
    useSSL: form.useSSL,
    ssl: form.useSSL
      ? form.caPath || form.clientCertPath || form.clientKeyPath
        ? {
          ca: form.caPath || undefined,
          cert: form.clientCertPath || undefined,
          key: form.clientKeyPath || undefined,
          rejectUnauthorized: !form.disableTLSVerification,
        }
        : true
      : undefined,
    caPath: form.caPath || undefined,
    clientCertPath: form.clientCertPath || undefined,
    clientKeyPath: form.clientKeyPath || undefined,
    disableTLSVerification: form.disableTLSVerification,
    useConnectionString: form.useConnectionString,
    srv: form.srv,
    usingSSH: form.usingSSH,
    ssh: sshConfig,
    privateKeyPath: ssh.privateKeyPath || undefined,
    passphrase: ssh.passphrase || undefined,
    readyTimeout: ssh.waitingTime ? Number(ssh.waitingTime) : undefined,
    algorithms: ssh.cipher ? { cipher: [ssh.cipher] } : undefined,
    redis: redisConfig,
    rdpConfig,
    advance: advanceConfig,
  };
  return {
    ...connectionFields,
    dbType: form.type,
    ssh: sshConfig,
    sshConnect: form.type === "SSH" ? sshConfig : undefined,
    redis: redisConfig,
    rdpConfig,
    advance: advanceConfig,
    port: form.type === "SSH"
      ? sshConfig.port || 22
      : form.port ? Number(form.port) : undefined,
    socketPath: form.socketPath || undefined,
    options: advancedOptions,
    ...standaloneSshFields,
  };
}

function save(): void {
  const connection = buildConnection();
  if (!connection) return;
  bridge?.emit("saveConnection", connection);
  message.value = "Connection saved.";
}

function connect(): void {
  if (form.type === "RDP" || (form.type === "SSH" && form.ssh.type === "native")) {
    save();
    return;
  }
  const connection = buildConnection();
  if (!connection) return;
  bridge?.emit("connect", connection);
  message.value = "Connecting…";
}

function cancel(): void {
  bridge?.emit("close");
}

onMounted(() => {
  resultSubscription = bridge?.on("connectResult", (content) => {
    message.value = content ? String(content) : "Connected.";
  });
  errorSubscription = bridge?.on("error", (content) => {
    message.value = String(content ?? "Connection failed.");
  });
  bridge?.emit("route-connect");
});

onBeforeUnmount(() => {
  resultSubscription?.dispose();
  errorSubscription?.dispose();
});
</script>

<template>
  <div
    class="root-container flex mx-auto connection-view"
    data-route="connect"
  >
    <div class="connect-container max-lg:px-5">
      <section class="mb-2 connection-view__heading">
        <img
          class="connect-logo"
          :src="webviewAsset('databases.png')"
          alt="Database Client"
        >
        <h1 class="py-4 text-2xl">
          Database Connection
        </h1>
      </section>

      <div class="connection-panel">
        <div id="connect-config-container">
          <ConnectResult />
          <ServiceSelector
            v-model="form.type"
            :groups="selectorGroups"
            :icon-for="serverIcon"
            :more-types="moreServerTypes"
          />

          <section class="connect-input-item mb-3 group-selection">
            <div class="inline-block mr-3">
              <label class="mr-4 inline-block min-w-8">{{ translator.t("connect.name", "Name") }}</label>
              <ElInput
                :model-value="form.name"
                class="field__input w-32 lg:w-36"
                :placeholder="translator.t('connect.connectionName', 'Connection name')"
                clearable
                @update:model-value="(value: string) => (form.name = value)"
              />
            </div>
            <div class="inline-block mr-3">
              <label class="mr-4 inline-block min-w-10">
                <RedMark />{{ translator.t("connect.group", "Group") }}
              </label>
              <ElPopover
                :visible="groupVisible"
                placement="bottom"
                popper-class="!p-0"
                trigger="click"
                :hide-after="0"
                @update:visible="(value: boolean) => (groupVisible = value)"
              >
                <template #reference>
                  <ElInput
                    :model-value="form.group"
                    class="field__input w-32"
                    :placeholder="translator.t('connect.groupPlaceholder', 'Optional group')"
                    clearable
                    @update:model-value="(value: string) => (form.group = value)"
                    @input="groupVisible = false"
                  />
                </template>
                <div class="max-h-[300px]">
                  <div
                    v-for="entry in connectionGroups"
                    :key="entry"
                    class="el-select-dropdown__item min-w-[100px]"
                    @click="form.group = entry; groupVisible = false"
                  >
                    {{ entry }}
                  </div>
                </div>
              </ElPopover>
            </div>
            <div class="inline-block mr-5">
              <VscButton
                icon="codicon-gear"
                size="mini"
                @click="advanceVisible = true"
              >
                {{ translator.t("connect.advance", "Advance") }}
              </VscButton>
            </div>
            <div class="inline-flex items-center">
              <label class="mr-4">
                <RedMark />{{ translator.t("connect.scope", "Scope") }}
              </label>
              <ElRadioGroup
                :model-value="form.global"
                @update:model-value="(value) => (form.global = Boolean(value))"
              >
                <ElRadio :value="true">
                  {{ translator.t("connect.global", "Global") }}
                </ElRadio>
                <ElRadio
                  :value="false"
                  :disabled="!isPay"
                >
                  {{ translator.t("connect.current", "Workspace") }}
                </ElRadio>
                <PayBadge
                  :left="-40"
                  style="top: -5px"
                />
              </ElRadioGroup>
            </div>
          </section>

          <div
            v-if="showTrinoWarning"
            class="warning-message mb-2"
          >
            <i
              class="codicon-warning"
              style="color: var(--vscode-editorWarning-foreground); margin-right: 5px"
            />
            {{ translator.t("connect.trinoWarning", "Trino requires a JDBC driver.") }}
          </div>

          <div
            class="connection-view__grid connection-view__main-grid"
            :class="{ 'connection-view__main-grid--core': isCoreConnectionType(form.type) }"
          >
            <label
              v-if="form.type !== 'SSH'"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Host</span>
              <UiInput
                v-model="form.host"
                placeholder="localhost"
              />
            </label>
            <label
              v-if="form.type !== 'SSH'"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Port</span>
              <UiInput
                v-model="form.port"
                type="number"
                placeholder="Optional"
              />
            </label>
            <label
              v-if="form.type !== 'SSH'"
              class="inline-block mr-10"
            >
              <span class="common_input_label">User</span>
              <UiInput v-model="form.user" />
            </label>
            <label
              v-if="form.type !== 'SSH'"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Password</span>
              <PasswordInput v-model="form.password" />
            </label>
            <label
              v-if="form.type !== 'SSH'"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Database</span>
              <UiInput v-model="form.database" />
              <VscButton
                v-if="isCoreConnectionType(form.type)"
                type="default"
                @click="form.type === 'Redis' ? redisAdvanceVisible = true : advanceVisible = true"
              >
                ⚙ Advance
              </VscButton>
            </label>
            <label
              v-if="['MySQL', 'MariaDB', 'MySQLCompatible'].includes(form.type)"
              class="inline-block mr-10 connection-view__socket-field"
            >
              <span class="common_input_label">Socket path</span>
              <UiInput
                v-model="form.socketPath"
                placeholder="/var/run/mysqld/mysqld.sock"
              />
            </label>
            <label
              v-if="!isCoreConnectionType(form.type)"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Schema</span>
              <UiInput v-model="form.schema" />
            </label>
            <label
              v-if="!isCoreConnectionType(form.type)"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Include databases</span>
              <UiInput
                v-model="form.includeDatabases"
                placeholder="db1,db2"
              />
            </label>
            <label
              v-if="!isCoreConnectionType(form.type)"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Connection URL</span>
              <UiInput
                v-model="form.connectionUrl"
                placeholder="Optional driver URL"
              />
            </label>
            <label
              v-if="!isCoreConnectionType(form.type)"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Database file</span>
              <UiInput
                v-model="form.dbPath"
                placeholder="SQLite / DuckDB path"
              />
            </label>
            <label
              v-if="!isCoreConnectionType(form.type)"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Connection timeout</span>
              <UiInput
                v-model="form.connectTimeout"
                type="number"
                placeholder="30000"
              />
            </label>
            <label
              v-if="!isCoreConnectionType(form.type)"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Request timeout</span>
              <UiInput
                v-model="form.requestTimeout"
                type="number"
                placeholder="10000"
              />
            </label>
            <label
              v-if="!isCoreConnectionType(form.type)"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Timezone</span>
              <UiInput
                v-model="form.timezone"
                placeholder="+00:00"
              />
            </label>
            <label
              v-if="!isCoreConnectionType(form.type)"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Auth type</span>
              <UiSelect
                v-model="form.authType"
                :options="['default', 'account', 'token', 'password', 'scram-sha-256', 'scram-sha-512']"
              />
            </label>
            <label
              v-if="!isCoreConnectionType(form.type)"
              class="inline-block mr-10"
            >
              <span class="common_input_label">Auth source</span>
              <UiInput v-model="form.authSource" />
            </label>
            <label
              v-if="!isCoreConnectionType(form.type) || isCoreSqlConnectionType(form.type) || form.type === 'Redis'"
              class="inline-block mr-10 inline-flex items-center"
            >
              <span class="common_input_label">Transport</span>
              <span>
                <input
                  v-model="form.useSSL"
                  type="checkbox"
                > SSL
                <VscButton
                  v-if="form.useSSL"
                  type="default"
                  @click="sslVisible = true"
                >
                  ⚙
                </VscButton>
                <input
                  v-model="form.usingSSH"
                  type="checkbox"
                > SSH tunnel
              </span>
            </label>
            <label
              v-if="form.type === 'MongoDB'"
              class="inline-block mr-10 inline-flex items-center"
            >
              <span class="common_input_label">MongoDB</span>
              <span>
                <input
                  v-model="form.srv"
                  type="checkbox"
                > SRV
                <input
                  v-model="form.useConnectionString"
                  type="checkbox"
                > Connection string
              </span>
            </label>
            <label
              v-if="form.useConnectionString && !isCoreConnectionType(form.type)"
              class="inline-block mr-10 w-full"
            >
              <span class="common_input_label">Connection string</span>
              <UiInput
                v-model="form.connectionUrl"
                placeholder="mongodb+srv://user:password@server/database"
              />
            </label>
            <section
              v-if="form.type === 'Redis'"
              class="connection-view__special-section w-full"
            >
              <div class="connection-view__redis-socket">
                <label class="inline-block mr-10">
                  <span class="common_input_label">Socket path</span>
                  <UiInput
                    v-model="form.socketPath"
                    placeholder="/var/run/redis/redis.sock"
                  />
                </label>
                <VscButton
                  type="default"
                  @click="form.socketPath = '/var/run/redis/redis.sock'"
                >
                  Use
                </VscButton>
              </div>
              <div class="connection-view__grid connection-view__grid--checks">
                <label class="inline-block mr-10 inline-flex items-center"><span class="common_input_label">Databases</span><span><input
                  v-model="form.redisConfig.allDatabase"
                  type="checkbox"
                > All Database</span></label>
                <label class="inline-block mr-10 inline-flex items-center"><span class="common_input_label">Mode</span><span><input
                  v-model="form.redisConfig.cluster"
                  type="checkbox"
                  :disabled="Boolean(form.socketPath)"
                > Cluster</span></label>
                <label class="inline-block mr-10 inline-flex items-center"><span class="common_input_label">Module</span><span><input
                  v-model="form.redisConfig.stack"
                  type="checkbox"
                > Redis JSON</span></label>
              </div>
            </section>
            <section
              v-if="form.useSSL && !isCoreConnectionType(form.type)"
              class="connection-view__advanced w-full"
            >
              <h2>SSL options</h2>
              <div class="connection-view__grid">
                <label class="inline-block mr-10"><span class="common_input_label">CA certificate</span><UiInput
                  v-model="form.caPath"
                  placeholder="CA path"
                /></label>
                <label class="inline-block mr-10"><span class="common_input_label">Client certificate</span><UiInput
                  v-model="form.clientCertPath"
                  placeholder="Client cert path"
                /></label>
                <label class="inline-block mr-10"><span class="common_input_label">Client key</span><UiInput
                  v-model="form.clientKeyPath"
                  placeholder="Client key path"
                /></label>
                <label class="inline-block mr-10 inline-flex items-center"><span class="common_input_label">TLS</span><span><input
                  v-model="form.disableTLSVerification"
                  type="checkbox"
                > Disable certificate verification</span></label>
              </div>
            </section>
            <section
              v-if="form.usingSSH || form.type === 'SSH'"
              class="connection-view__special-section w-full"
            >
              <div class="connection-view__grid">
                <label class="inline-block mr-10"><span class="common_input_label">SSH host</span><UiInput
                  v-model="form.ssh.host"
                  placeholder="SSH host"
                /></label>
                <label class="inline-block mr-10"><span class="common_input_label">SSH port</span><UiInput
                  v-model="form.ssh.port"
                  type="number"
                  placeholder="22"
                /></label>
                <label class="inline-block mr-10"><span class="common_input_label">SSH user</span><span class="connection-view__field-with-action"><UiInput
                  v-model="form.ssh.username"
                  placeholder="root"
                /><VscButton
                  v-if="form.type === 'SSH'"
                  type="default"
                  @click="sshAdvanceVisible = true"
                >⚙ Advance</VscButton></span></label>
                <label class="inline-block mr-10"><span class="common_input_label">SSH auth</span><UiSelect
                  v-model="form.ssh.type"
                  :options="form.type === 'SSH' ? ['native', 'auto', 'password', 'privateKey', 'privateKeyAndPassword', 'agent'] : ['auto', 'password', 'privateKey', 'privateKeyAndPassword', 'agent']"
                /></label>
                <label
                  v-if="['password', 'privateKeyAndPassword', 'auto'].includes(form.ssh.type)"
                  class="inline-block mr-10"
                ><span class="common_input_label">SSH password</span><UiInput
                  v-model="form.ssh.password"
                  type="password"
                /></label>
                <label
                  v-if="['privateKey', 'privateKeyAndPassword', 'auto', 'native'].includes(form.ssh.type)"
                  class="inline-block mr-10"
                ><span class="common_input_label">Private key</span><UiInput
                  v-model="form.ssh.privateKeyPath"
                  placeholder="~/.ssh/id_ed25519"
                /></label>
                <label
                  v-if="form.ssh.type !== 'native'"
                  class="inline-block mr-10"
                ><span class="common_input_label">Passphrase</span><UiInput
                  v-model="form.ssh.passphrase"
                  type="password"
                /></label>
                <label
                  v-if="form.ssh.type === 'agent'"
                  class="inline-block mr-10"
                ><span class="common_input_label">Agent path</span><UiInput
                  v-model="form.ssh.agentPath"
                  placeholder="env.SSH_AUTH_SOCK"
                /></label>
                <label
                  v-if="form.type !== 'SSH'"
                  class="inline-block mr-10"
                ><span class="common_input_label">Ready timeout</span><UiInput
                  v-model="form.ssh.waitingTime"
                  type="number"
                  placeholder="30000"
                /></label>
                <label class="inline-block mr-10"><span class="common_input_label">Cipher</span><UiSelect
                  v-model="form.ssh.cipher"
                  :options="['aes128-ctr', 'aes256-ctr', 'aes128-cbc', 'aes256-cbc', 'chacha20-poly1305']"
                /></label>
              </div>
            </section>
            <section
              v-if="form.type === 'RDP'"
              class="connection-view__special-section w-full"
            >
              <div class="connection-view__grid connection-view__grid--checks">
                <label class="inline-block mr-10 inline-flex items-center"><span class="common_input_label">Display</span><span><input
                  v-model="form.rdpConfig.fullScreen"
                  type="checkbox"
                > Full Screen</span></label>
                <label class="inline-block mr-10 inline-flex items-center"><span class="common_input_label">Sizing</span><span><input
                  v-model="form.rdpConfig.smartSizing"
                  type="checkbox"
                > Smart Sizing</span></label>
                <label class="inline-block mr-10 inline-flex items-center"><span class="common_input_label">Devices</span><span><input
                  v-model="form.rdpConfig.redirectDrives"
                  type="checkbox"
                > Redirect Drivers</span></label>
                <label class="inline-block mr-10 inline-flex items-center"><span class="common_input_label">Keyboard</span><span><input
                  v-model="form.rdpConfig.forwardComposition"
                  type="checkbox"
                > Forward Composition Key</span></label>
              </div>
            </section>
            <label
              v-if="!isCoreConnectionType(form.type)"
              class="inline-block mr-10 w-full"
            >
              <span class="common_input_label">Driver options (JSON)</span>
              <textarea
                v-model="form.optionsText"
                class="field__input connection-view__options"
                spellcheck="false"
                placeholder="{&quot;ssl&quot;: true}"
              />
            </label>
            <ConnectionDialog
              :open="advanceVisible"
              title="Advance"
              @close="advanceVisible = false"
            >
              <div class="mb-2 config-item">
                <div class="inline-block mr-10">
                  <label class="common_input_label">{{ translator.t("connect.color", "Color") }}</label>
                  <ElColorPicker
                    :model-value="form.color"
                    class="color-tag"
                    size="small"
                    @update:model-value="(value: string | null) => (form.color = value ?? '')"
                  />
                </div>
              </div>
              <div class="connection-dialog__section-title">
                Tree View:
              </div>
              <label class="connection-dialog__field connection-dialog__field--inline">
                <span>Load metadata when expanding tree view</span>
                <input
                  v-model="form.advance.loadMetaDataWhenExpandTreeView"
                  type="checkbox"
                >
              </label>
              <label class="connection-dialog__field connection-dialog__field--inline">
                <span>Group tables</span>
                <input
                  v-model="form.advance.groupingTables"
                  type="checkbox"
                >
              </label>
              <label
                v-if="form.advance.groupingTables"
                class="connection-dialog__field"
              >
                <span>Grouping threshold</span>
                <UiInput
                  v-model="form.advance.groupingThreshold"
                  type="number"
                  placeholder="50"
                />
              </label>
              <label class="connection-dialog__field">
                <span>Hide system schemas</span>
                <select
                  v-model="form.advance.hideSystemSchema"
                  class="field__input"
                >
                  <option value="recommended">Recommended</option>
                  <option :value="true">Yes</option>
                  <option :value="false">No</option>
                </select>
              </label>
              <label class="connection-dialog__field">
                <span>Excluded schemas</span>
                <UiInput
                  v-model="form.advance.excludedSchemas"
                  placeholder="regex"
                />
              </label>
              <label class="connection-dialog__field">
                <span>Excluded databases</span>
                <UiInput
                  v-model="form.advance.excludedDatabases"
                  placeholder="regex"
                />
              </label>
              <label class="connection-dialog__field connection-dialog__field--inline">
                <span>Use custom database name</span>
                <input
                  v-model="form.advance.usingCustomDatabaseName"
                  type="checkbox"
                >
              </label>
              <label class="connection-dialog__field">
                <span>Displayed databases</span>
                <UiInput
                  v-model="form.includeDatabases"
                  placeholder="e.g. db1,db2"
                />
              </label>
              <div class="connection-dialog__section-title">
                SQL:
              </div>
              <label
                v-if="isCoreSqlConnectionType(form.type)"
                class="connection-dialog__field connection-dialog__field--inline"
              >
                <span>Compatible mode</span>
                <input
                  v-model="form.advance.compatibleMode"
                  type="checkbox"
                >
              </label>
              <label class="connection-dialog__field">
                <span>Default select limit</span>
                <UiInput
                  v-model="form.advance.defaultSelectLimit"
                  type="number"
                  placeholder="1000"
                />
              </label>
              <label class="connection-dialog__field">
                <span>Auto descending columns</span>
                <UiInput
                  v-model="form.advance.autoDescendingColumns"
                  placeholder="e.g. id,name"
                />
              </label>
              <label class="connection-dialog__field">
                <span>Custom terminal command</span>
                <textarea
                  v-model="form.advance.customTerminalCommand"
                  class="field__input connection-dialog__textarea"
                />
              </label>
              <label class="connection-dialog__field">
                <span>Startup SQL</span>
                <textarea
                  v-model="form.advance.startupSQL"
                  class="field__input connection-dialog__textarea"
                />
              </label>
            </ConnectionDialog>
            <ConnectionDialog
              v-if="form.type === 'Redis'"
              :open="redisAdvanceVisible"
              title="Advance"
              width="650px"
              @close="redisAdvanceVisible = false"
            >
              <label class="connection-dialog__field">
                <span>Database count</span>
                <UiInput
                  v-model="form.redisConfig.databaseNumber"
                  type="number"
                  placeholder="16"
                />
              </label>
              <label class="connection-dialog__field">
                <span>Total key count</span>
                <UiInput
                  v-model="form.redisConfig.totalKeyCount"
                  type="number"
                  placeholder="10000"
                />
              </label>
              <label class="connection-dialog__field">
                <span>Displayed databases</span>
                <UiInput
                  v-model="form.includeDatabases"
                  placeholder="e.g. 0,1,2"
                />
              </label>
            </ConnectionDialog>
            <ConnectionDialog
              v-if="form.type === 'SSH'"
              :open="sshAdvanceVisible"
              title="Advance"
              width="500px"
              @close="sshAdvanceVisible = false"
            >
              <label class="connection-dialog__field">
                <span>Server Type</span>
                <UiSelect
                  v-model="form.ssh.serverType"
                  :options="['linux', 'macos', 'windows']"
                />
              </label>
              <label class="connection-dialog__field">
                <span>Shell</span>
                <textarea
                  v-model="form.ssh.shell"
                  class="field__input connection-dialog__textarea"
                  placeholder="Default remote shell"
                />
              </label>
              <div class="connection-dialog__section-title">
                SFTP:
              </div>
              <label class="connection-dialog__field">
                <span>Root path</span>
                <UiInput
                  v-model="form.ssh.ftpRoot"
                  placeholder="/"
                />
              </label>
              <label class="connection-dialog__field connection-dialog__field--inline">
                <span>Prune SFTP root</span>
                <input
                  v-model="form.ssh.pruneSFTPRoot"
                  type="checkbox"
                >
              </label>
              <label class="connection-dialog__field connection-dialog__field--inline">
                <span>Show hidden files</span>
                <input
                  v-model="form.ssh.showHiddenFiles"
                  type="checkbox"
                >
              </label>
            </ConnectionDialog>
            <ConnectionDialog
              v-if="form.useSSL"
              :open="sslVisible"
              title="SSL configuration"
              width="580px"
              @close="sslVisible = false"
            >
              <label class="connection-dialog__field">
                <span>CA certificate</span>
                <UiInput
                  v-model="form.caPath"
                  placeholder="SSL CA certificate path"
                />
              </label>
              <label class="connection-dialog__field">
                <span>Client certificate</span>
                <UiInput
                  v-model="form.clientCertPath"
                  placeholder="SSL client certificate path"
                />
              </label>
              <label class="connection-dialog__field">
                <span>Client key</span>
                <UiInput
                  v-model="form.clientKeyPath"
                  placeholder="SSL client key path"
                />
              </label>
              <label class="connection-dialog__field connection-dialog__field--inline">
                <span>Disable certificate verification</span>
                <input
                  v-model="form.disableTLSVerification"
                  type="checkbox"
                >
              </label>
            </ConnectionDialog>
          </div>
        </div>
        <div
          class="connect-bar"
          :class="{ loading: connectResult.loading }"
        >
          <VscButton
            @click="save"
          >
            Save
          </VscButton>
          <VscButton
            v-if="form.type !== 'RDP'"
            type="primary"
            @click="connect"
          >
            Connect
          </VscButton>
          <VscButton
            type="default"
            @click="cancel"
          >
            Cancel
          </VscButton>
        </div>
        <p
          v-if="message"
          class="route-workspace__status"
        >
          {{ message }}
        </p>
      </div>
    </div>
  </div>
</template>
