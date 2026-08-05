<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";
import UiInput from "./UiInput.vue";
import UiSelect from "./UiSelect.vue";

interface FileGroup {
  readonly name?: string;
  readonly type?: string;
  readonly rowCount?: number;
}

interface FileInfo {
  connected?: boolean;
  dbType?: string;
  dbPath?: string;
  fileName?: string;
  name?: string;
  groups?: FileGroup[];
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const route = useRoute();
const bootstrap = readWebviewBootstrap();
const initial = bootstrap.state as FileInfo;
const form = reactive({
  dbType: initial.dbType || "SQLite",
  dbPath: initial.dbPath || "",
  name: initial.name || initial.fileName || "",
});
const fileInfo = reactive<FileInfo>({
  connected: initial.connected,
  dbType: initial.dbType,
  dbPath: initial.dbPath,
  fileName: initial.fileName,
  name: initial.name,
  groups: initial.groups || [],
});
const status = ref("");
const hasDependency = ref<Record<string, unknown>>({});
let infoSubscription: BridgeDisposable | undefined;
let optionSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;
let successSubscription: BridgeDisposable | undefined;

const routeName = computed(() => route.name === "sqlite" ? "sqlite" : "dbFileConnect");
const title = computed(() => routeName.value === "sqlite" ? "SQLite database" : "Database file");

function applyInfo(content: unknown): void {
  if (!content || typeof content !== "object") return;
  const next = content as FileInfo;
  Object.assign(fileInfo, next);
  if (typeof next.dbType === "string") form.dbType = next.dbType;
  if (typeof next.dbPath === "string") form.dbPath = next.dbPath;
  if (typeof next.name === "string") form.name = next.name;
}

function connect(): void {
  status.value = "Connecting…";
  bridge?.emit("connecting", {
    connectionOption: {
      dbType: form.dbType,
      dbPath: form.dbPath,
      name: form.name,
    },
    saveOnly: true,
  });
}

function installDependency(): void {
  bridge?.emit("installDependency", form.dbType === "DuckDB" ? "duckDB" : "sqlite3");
}

onMounted(() => {
  infoSubscription = bridge?.on("fileInfo", applyInfo);
  optionSubscription = bridge?.on("option", (content) => {
    const value = content as { dependency?: Record<string, unknown> };
    if (value?.dependency) hasDependency.value = value.dependency;
  });
  errorSubscription = bridge?.on("error", (content) => {
    status.value = content && typeof content === "object" && "message" in content
      ? String((content as { message?: unknown }).message || "Connection failed")
      : String(content || "Connection failed");
  });
  successSubscription = bridge?.on("success", (content) => {
    status.value = content && typeof content === "object" && "message" in content
      ? String((content as { message?: unknown }).message || "Connected")
      : "Connected";
  });
  bridge?.emit("init");
});

onBeforeUnmount(() => {
  infoSubscription?.dispose();
  optionSubscription?.dispose();
  errorSubscription?.dispose();
  successSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace database-file-view"
    :data-route="routeName"
  >
    <header class="route-workspace__header">
      <div>
        <h1>{{ title }}</h1>
        <p class="route-workspace__subline">
          Connect a local SQLite or DuckDB file.
        </p>
      </div>
      <UiButton
        type="button"
        @click="connect"
      >
        {{ fileInfo.connected ? "Reconnect" : "Connect" }}
      </UiButton>
    </header>
    <div class="route-workbench__toolbar">
      <UiSelect
        v-model="form.dbType"
        :options="[
          { label: 'SQLite', value: 'SQLite' },
          { label: 'DuckDB', value: 'DuckDB' },
        ]"
      />
      <UiInput
        v-model="form.name"
        placeholder="Connection name"
      />
      <UiInput
        v-model="form.dbPath"
        placeholder="Database file path"
      />
    </div>
    <div class="route-workspace__actions">
      <UiButton
        type="button"
        variant="default"
        @click="bridge?.emit('reveal')"
      >
        Reveal file
      </UiButton>
      <UiButton
        type="button"
        variant="default"
        @click="installDependency"
      >
        Check dependency
      </UiButton>
      <UiButton
        type="button"
        variant="default"
        @click="bridge?.emit('openSite', 'pricing')"
      >
        Dependency help
      </UiButton>
    </div>
    <p
      v-if="status"
      class="route-workspace__status"
    >
      {{ status }}
    </p>
    <p
      v-if="Object.keys(hasDependency).length > 0"
      class="route-workspace__subline"
    >
      Dependency status received from host.
    </p>
    <div
      v-if="fileInfo.groups?.length"
      class="result-view__table-wrap"
    >
      <table class="result-view__table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Rows</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="group in fileInfo.groups"
            :key="String(group.name)"
          >
            <td>{{ group.name }}</td>
            <td>{{ group.type }}</td>
            <td>{{ group.rowCount ?? "-" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
