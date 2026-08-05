<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";
import UiInput from "./UiInput.vue";
import UiSelect from "./UiSelect.vue";

interface ConnectionForm {
  id: string;
  name: string;
  type: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  schema: string;
  connectionUrl: string;
  dbPath: string;
  optionsText: string;
  options?: Record<string, unknown>;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const initial = (bootstrap.state.connection ?? {}) as Partial<ConnectionForm>;
const form = reactive<ConnectionForm>({
  id: initial.id ?? "connection-" + Date.now(),
  name: initial.name ?? "",
  type: initial.type ?? "MySQL",
  host: initial.host ?? "localhost",
  port: initial.port == null ? "" : String(initial.port),
  user: initial.user ?? "",
  password: initial.password ?? "",
  database: initial.database ?? "",
  schema: initial.schema ?? "",
  connectionUrl: initial.connectionUrl ?? "",
  dbPath: initial.dbPath ?? "",
  optionsText: initial.options ? JSON.stringify(initial.options, null, 2) : "",
});
const message = ref("");
let resultSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

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

function save(): void {
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
      return;
    }
  }
  const { optionsText: _optionsText, ...connectionFields } = form;
  const connection = {
    ...connectionFields,
    port: form.port ? Number(form.port) : undefined,
    options,
  };
  bridge?.emit("saveConnection", connection);
  bridge?.emit("save", connection);
  bridge?.emit("connect", connection);
  message.value = "Connection saved.";
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
  <section
    class="route-workspace connection-view"
    data-route="connect"
  >
    <header class="route-workspace__header">
      <div>
        <h1>Database Connection</h1>
        <p class="route-workspace__subline">
          Configure and test a saved connection.
        </p>
      </div>
      <div class="route-workspace__actions">
        <UiButton
          type="button"
          @click="save"
        >
          Save
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="cancel"
        >
          Cancel
        </UiButton>
      </div>
    </header>

    <div class="connection-view__grid">
      <label class="vsc-field">
        <span class="vsc-field__label">Name</span>
        <UiInput
          v-model="form.name"
          placeholder="Connection name"
        />
      </label>
      <label class="vsc-field">
        <span class="vsc-field__label">Type</span>
        <UiSelect
          v-model="form.type"
          :options="databaseTypes"
        />
      </label>
      <label class="vsc-field">
        <span class="vsc-field__label">Host</span>
        <UiInput
          v-model="form.host"
          placeholder="localhost"
        />
      </label>
      <label class="vsc-field">
        <span class="vsc-field__label">Port</span>
        <UiInput
          v-model="form.port"
          type="number"
          placeholder="Optional"
        />
      </label>
      <label class="vsc-field">
        <span class="vsc-field__label">User</span>
        <UiInput v-model="form.user" />
      </label>
      <label class="vsc-field">
        <span class="vsc-field__label">Password</span>
        <UiInput
          v-model="form.password"
          type="password"
        />
      </label>
      <label class="vsc-field">
        <span class="vsc-field__label">Database</span>
        <UiInput v-model="form.database" />
      </label>
      <label class="vsc-field">
        <span class="vsc-field__label">Schema</span>
        <UiInput v-model="form.schema" />
      </label>
      <label class="vsc-field">
        <span class="vsc-field__label">Connection URL</span>
        <UiInput
          v-model="form.connectionUrl"
          placeholder="Optional driver URL"
        />
      </label>
      <label class="vsc-field">
        <span class="vsc-field__label">Database file</span>
        <UiInput
          v-model="form.dbPath"
          placeholder="SQLite / DuckDB path"
        />
      </label>
      <label class="vsc-field vsc-field--wide">
        <span class="vsc-field__label">Driver options (JSON)</span>
        <textarea
          v-model="form.optionsText"
          class="vsc-input connection-view__options"
          spellcheck="false"
          placeholder="{&quot;ssl&quot;: true}"
        />
      </label>
    </div>
    <p
      v-if="message"
      class="route-workspace__status"
    >
      {{ message }}
    </p>
  </section>
</template>
