<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import { createTranslator } from "../i18n";

type MainTab = "design" | "result" | "erDiagram" | "mock" | "manager" | "es-status";

interface TabItem {
  readonly id: MainTab;
  readonly label: string;
  readonly icon: string;
  readonly hidden?: boolean;
  readonly disabled?: boolean;
}

interface TableInfoMessage {
  readonly singleTable?: unknown;
  readonly dbType?: unknown;
}

interface DatabaseInfoMessage {
  readonly database?: unknown;
  readonly schema?: unknown;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const translator = createTranslator(bootstrap.language);
const route = useRoute();
const router = useRouter();
const dbType = ref(String(bootstrap.state.dbType ?? bootstrap.state.connectionType ?? ""));
const singleTable = ref(Boolean(bootstrap.state.singleTable));
const database = ref(String(bootstrap.state.database ?? ""));
const schema = ref(String(bootstrap.state.schema ?? ""));
const loadingSchema = ref(false);
const showSqlPanel = ref(bootstrap.state.showSQLPanel !== false);
let tableInfoSubscription: BridgeDisposable | undefined;
let databaseInfoSubscription: BridgeDisposable | undefined;
let openMockSubscription: BridgeDisposable | undefined;
let openDumpSubscription: BridgeDisposable | undefined;

const noSqlTypes = new Set([
  "cassandra",
  "elasticsearch",
  "kafka",
  "lokI".toLowerCase(),
  "mongodb",
  "neo4j",
  "rabbitmq",
  "redis",
  "zookeeper",
  "etcd",
]);

const currentTab = computed<MainTab>(() => {
  const name = String(route.name ?? "result");
  return ["design", "result", "erDiagram", "mock", "manager", "es-status"].includes(name)
    ? name as MainTab
    : "result";
});

const isNoSql = computed(() => noSqlTypes.has(dbType.value.trim().toLocaleLowerCase()));

const tabItems = computed<TabItem[]>(() => {
  const items: TabItem[] = [
    {
      id: "design",
      label: translator.t("table.design", "Design"),
      icon: "codicon codicon-edit",
      disabled: !singleTable.value,
    },
    {
      id: "result",
      label: translator.t("table.data", "Data"),
      icon: "codicon codicon-database blue",
    },
    {
      id: "erDiagram",
      label: translator.t("table.erDiagram", "ER Diagram"),
      icon: "codicon codicon-symbol-class yellow",
      hidden: isNoSql.value,
      disabled: !singleTable.value || isNoSql.value,
    },
    {
      id: "mock",
      label: translator.t("table.mock", "Mock"),
      icon: "codicon codicon-beaker purple",
      hidden: isNoSql.value,
      disabled: !singleTable.value || isNoSql.value,
    },
    {
      id: "manager",
      label: translator.t("table.manager", "Manager"),
      icon: "codicon codicon-symbol-property",
      hidden: isNoSql.value,
    },
    {
      id: "es-status",
      label: translator.t("table.monitor", "Monitor"),
      icon: "codicon codicon-graph-line",
      hidden: dbType.value.trim().toLocaleLowerCase() !== "elasticsearch",
    },
  ];
  return items.filter((item) => !item.hidden);
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function applyTableInfo(content: unknown): void {
  const value = record(content) as TableInfoMessage;
  if (typeof value.dbType === "string") dbType.value = value.dbType;
  if (typeof value.singleTable === "boolean") singleTable.value = value.singleTable;
}

function applyDatabaseInfo(content: unknown): void {
  const value = record(content) as DatabaseInfoMessage;
  if (value.database !== undefined) database.value = String(value.database ?? "");
  if (value.schema !== undefined) schema.value = String(value.schema ?? "");
}

async function selectTab(item: TabItem): Promise<void> {
  if (item.disabled || currentTab.value === item.id) return;
  await router.push({ name: item.id });
}

async function pickDatabaseSchema(): Promise<void> {
  if (loadingSchema.value) return;
  loadingSchema.value = true;
  try {
    bridge?.emit("pickDbSchema");
  } finally {
    loadingSchema.value = false;
  }
}

function viewAsJson(): void {
  bridge?.emit("viewJSON");
}

function viewHistory(): void {
  bridge?.emit("viewHistory");
}

function handleWindowMessage(event: MessageEvent<unknown>): void {
  const message = record(event.data);
  if (message.type !== "RUN" && message.type !== "DATA") return;
  const content = record(message.content);
  if (typeof content.dbType === "string") dbType.value = content.dbType;
  if (!["design", "result", "erDiagram"].includes(String(route.name))) {
    void router.push({ name: "result" });
  }
}

onMounted(() => {
  tableInfoSubscription = bridge?.on("table_info", applyTableInfo);
  databaseInfoSubscription = bridge?.on("db_info", applyDatabaseInfo);
  openMockSubscription = bridge?.on("open_mock", () => {
    void router.push({ name: "mock" });
  });
  openDumpSubscription = bridge?.on("open_dump", () => {
    void router.push({ name: "manager" });
  });
  window.addEventListener("message", handleWindowMessage);
});

onBeforeUnmount(() => {
  tableInfoSubscription?.dispose();
  databaseInfoSubscription?.dispose();
  openMockSubscription?.dispose();
  openDumpSubscription?.dispose();
  window.removeEventListener("message", handleWindowMessage);
});
</script>

<template>
  <div
    v-if="showSqlPanel"
    id="tableTab"
    class="table-tab-shell"
    data-route="main"
  >
    <ul
      class="tab"
      role="tablist"
    >
      <li
        v-for="item in tabItems"
        :key="item.id"
        class="tab__item"
        :class="{
          'tab__item--active': currentTab === item.id,
          disabled: item.disabled,
        }"
        :aria-disabled="item.disabled"
        :aria-selected="currentTab === item.id"
        role="tab"
        tabindex="0"
        @click="void selectTab(item)"
        @keydown.enter="void selectTab(item)"
        @keydown.space.prevent="void selectTab(item)"
      >
        <i
          class="tab__icon"
          :class="item.icon"
          aria-hidden="true"
        />
        {{ item.label }}
      </li>
      <li
        class="panel-icon"
        :title="translator.t('table.viewAsJSON', 'View as JSON')"
        role="button"
        tabindex="0"
        @click="viewAsJson"
        @keydown.enter="viewAsJson"
      >
        <i class="codicon codicon-json text-yellow" aria-hidden="true" />
      </li>
      <li
        class="panel-icon"
        :title="translator.t('table.history', 'History')"
        role="button"
        tabindex="0"
        @click="viewHistory"
        @keydown.enter="viewHistory"
      >
        <i class="codicon codicon-history" aria-hidden="true" />
      </li>
      <template v-if="database">
        <li
          class="panel-icon info db-info-clickable"
          :class="{ loading: loadingSchema }"
          role="button"
          tabindex="0"
          @click="void pickDatabaseSchema()"
          @keydown.enter="void pickDatabaseSchema()"
        >
          <i class="codicon codicon-database blue" aria-hidden="true" />
          {{ database }}
        </li>
        <li
          v-if="schema"
          class="panel-icon info db-info-clickable"
          role="button"
          tabindex="0"
          @click="void pickDatabaseSchema()"
          @keydown.enter="void pickDatabaseSchema()"
        >
          <i class="codicon codicon-symbol-structure yellow" aria-hidden="true" />
          {{ schema }}
        </li>
      </template>
    </ul>
  </div>
</template>
