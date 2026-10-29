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
  <div v-show="showSqlPanel">
    <ul
      id="tableTab"
      class="tab"
    >
      <li
        v-for="(item, index) in tabItems"
        :key="index"
        :class="[
          'tab__item',
          {
            'tab__item--active': currentTab === item.id,
            disabled: item.disabled,
          },
        ]"
        @click="void selectTab(item)"
      >
        <i
          v-if="item.icon"
          type="icon"
          :class="item.icon"
          style="position: relative; top: 3px"
        />
        {{ " " + item.label }}
      </li>
      <VscTooltip :title="translator.t('table.viewAsJSON', 'View as JSON')">
        <div
          class="panel-icon"
          @click="viewAsJson"
        >
          <i class="codicon-json text-yellow" />
        </div>
      </VscTooltip>
      <VscTooltip :title="translator.t('table.history', 'History')">
        <div
          class="panel-icon"
          @click="viewHistory"
        >
          <i class="codicon-history" />
        </div>
      </VscTooltip>
      <template v-if="database">
        <div
          :class="['panel-icon info ml-1 db-info-clickable', { loading: loadingSchema }]"
          @click="void pickDatabaseSchema()"
        >
          <i class="codicon-database blue mr-0.5 text-sm" />
          {{ database }}
        </div>
        <div
          v-if="schema"
          :class="['panel-icon info db-info-clickable', { loading: loadingSchema }]"
          @click="void pickDatabaseSchema()"
        >
          <i class="codicon-symbol-structure yellow mr-0.5" />
          {{ schema }}
        </div>
      </template>
    </ul>
  </div>
</template>