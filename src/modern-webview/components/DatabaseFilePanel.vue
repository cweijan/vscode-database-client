<script setup lang="ts">
import {
  ElInput,
  ElPopover,
  ElRadio,
  ElRadioGroup,
} from "element-plus";
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import {
  markConnectError,
  markConnectLoading,
  markConnectSuccess,
} from "../connectState";
import { createTranslator } from "../i18n";
import { readWebviewBootstrap } from "../bootstrap";
import { usePayState } from "../license";
import ConnectResult from "./target/ConnectResult.vue";

interface FileGroup {
  readonly name?: string;
}

const props = withDefaults(
  defineProps<{
    embedded?: boolean;
    dbPath?: string;
    dbType?: string;
    fileName?: string;
    connected?: boolean;
    groups?: FileGroup[];
    hasDependency?: boolean;
    initialName?: string;
  }>(),
  {
    embedded: false,
    dbPath: "",
    dbType: "",
    fileName: "",
    connected: false,
    groups: () => [],
    hasDependency: undefined,
    initialName: "",
  },
);

const emit = defineEmits<{
  success: [];
  connectedChange: [value: boolean];
}>();

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const translator = createTranslator(bootstrap.language);
const isPay = usePayState();

const path = ref("");
const dbType = ref("SQLite");
const name = ref("");
const group = ref("");
const globalScope = ref(true);
const connectedState = ref(false);
const groupNames = ref<string[]>([]);
const groupVisible = ref(false);
const dependencies = ref<Record<string, unknown>>({});
let infoSubscription: BridgeDisposable | undefined;
let optionSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;
let successSubscription: BridgeDisposable | undefined;

const isDuckDb = computed(() => dbType.value === "DuckDB");
const iconPath = computed(() => isDuckDb.value
  ? "resources/icon/server/duckdb.svg"
  : "resources/icon/server/sqlite.svg");
const dependencyReady = computed(() => {
  if (props.hasDependency != null) return props.hasDependency;
  return Boolean(isDuckDb.value ? dependencies.value.duckDB : dependencies.value.sqlite3);
});
const fileName = computed(() => {
  if (props.fileName) return props.fileName;
  if (!path.value) return "";
  const parts = path.value.split(/[/\\]/);
  return parts[parts.length - 1] || path.value;
});

function applyFileInfo(content: unknown): void {
  if (!content || typeof content !== "object") return;
  const info = content as {
    dbPath?: string;
    dbType?: string;
    name?: string;
    connected?: boolean;
    groups?: FileGroup[];
  };
  if (info.dbPath) path.value = info.dbPath;
  if (info.dbType) dbType.value = info.dbType;
  if (info.name != null) name.value = info.name;
  if (info.connected != null) {
    connectedState.value = info.connected;
    emit("connectedChange", info.connected);
  }
  if (info.groups) groupNames.value = info.groups.map((entry) => String(entry?.name ?? entry));
}

watch(() => props.dbPath, (value) => {
  if (value) path.value = value;
}, { immediate: true });
watch(() => props.dbType, (value) => {
  if (value) dbType.value = value;
}, { immediate: true });
watch(() => props.fileName, (value) => {
  if (value && !name.value) name.value = value.replace(/\.[^.]+$/, "");
}, { immediate: true });
watch(() => props.connected, (value) => {
  if (value != null) connectedState.value = value;
}, { immediate: true });
watch(() => props.groups, (value) => {
  if (value) groupNames.value = value.map((entry) => String(entry?.name ?? entry));
}, { immediate: true });
watch(() => props.initialName, (value) => {
  if (value) name.value = value;
}, { immediate: true });

function connectionOption(): Record<string, unknown> {
  return {
    dbType: dbType.value,
    dbPath: path.value,
    name: name.value,
    group: group.value,
    global: globalScope.value,
  };
}

function connect(): void {
  markConnectLoading();
  bridge?.emit("connecting", { connectionOption: connectionOption(), saveOnly: true });
}

function reveal(): void {
  bridge?.emit("reveal");
}

function install(): void {
  bridge?.emit("installDependency", isDuckDb.value ? "duckDB" : "sqlite3");
}

function pickGroup(value: string): void {
  group.value = value;
  groupVisible.value = false;
}

function openPricing(): void {
  bridge?.emit("openSite", "pricing");
}

function initialize(): void {
  if (props.embedded) return;
  infoSubscription = bridge?.on("fileInfo", applyFileInfo);
  optionSubscription = bridge?.on("option", (content) => {
    const value = content as { dependency?: Record<string, unknown> };
    if (value?.dependency) dependencies.value = value.dependency;
  });
  errorSubscription = bridge?.on("error", (content) => {
    markConnectError(typeof content === "string" ? content : String(record(content).message ?? ""));
  });
  successSubscription = bridge?.on("success", (content) => {
    markConnectSuccess(String(record(content).message ?? ""));
    connectedState.value = true;
    emit("connectedChange", true);
    emit("success");
  });
  bridge?.emit("init");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

onMounted(initialize);

onBeforeUnmount(() => {
  infoSubscription?.dispose();
  optionSubscription?.dispose();
  errorSubscription?.dispose();
  successSubscription?.dispose();
});
</script>

<template>
  <div class="db-file-connect-panel">
    <ConnectResult />
    <div
      class="db-file-card"
      :class="{ 'db-file-card--connected': connectedState }"
    >
      <div class="db-file-card__header">
        <span class="db-file-card__icon">
          <img
            :src="iconPath"
            alt=""
            class="db-file-card__icon-img"
          >
        </span>
        <div class="db-file-card__meta">
          <span class="db-file-card__filename">{{ fileName }}</span>
          <span class="db-file-card__badge">{{ dbType }}</span>
        </div>
      </div>

      <template v-if="connectedState">
        <div class="db-file-card__status">
          <i class="codicon codicon-pass-filled" />
          <p class="db-file-card__status-title">
            {{ translator.t("dbFile.alreadyConnected", "Already connected") }}
          </p>
        </div>
        <div class="db-file-card__footer">
          <VscButton
            icon="codicon-database"
            size="small"
            @click="reveal"
          >
            {{ translator.t("dbFile.showInTree", "Show in tree") }}
          </VscButton>
        </div>
      </template>

      <template v-else>
        <section
          v-if="!dependencyReady"
          class="db-file-alert"
        >
          <i class="codicon codicon-warning" />
          <span>{{ dbType }} {{ translator.t("dbFile.notInstalled", "is not installed") }}</span>
          <VscButton
            size="small"
            @click="install"
          >
            {{ translator.t("dbFile.install", "Install") }}
          </VscButton>
        </section>

        <section class="db-file-form">
          <div class="form-field">
            <label class="form-field__label">
              <i class="codicon codicon-symbol-field" />
              {{ translator.t("connect.name", "Name") }}
            </label>
            <ElInput
              :model-value="name"
              class="field__input"
              :placeholder="translator.t('connect.connectionName', 'Connection name')"
              clearable
              @update:model-value="(value: string) => (name = value)"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">
              <i class="codicon codicon-folder" />
              {{ translator.t("connect.group", "Group") }}
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
                  :model-value="group"
                  class="field__input"
                  :placeholder="translator.t('connect.groupPlaceholder', 'Select a group')"
                  clearable
                  @update:model-value="(value: string) => (group = value)"
                  @input="groupVisible = false"
                />
              </template>
              <div class="max-h-[300px]">
                <div
                  v-for="entry in groupNames"
                  :key="entry"
                  class="el-select-dropdown__item min-w-[100px]"
                  @click="pickGroup(entry)"
                >
                  {{ entry }}
                </div>
              </div>
            </ElPopover>
          </div>
          <div class="form-field">
            <label class="form-field__label">
              <i class="codicon codicon-globe" />
              {{ translator.t("connect.scope", "Scope") }}
            </label>
            <ElRadioGroup
              :model-value="globalScope"
              class="scope-group"
              @update:model-value="(value) => (globalScope = Boolean(value))"
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

        <p
          v-if="!isPay"
          class="pay-notice"
          @click="openPricing"
        >
          {{ translator.t("pay.connectNotice", "Upgrade to save workspace-scoped connections.") }}
        </p>

        <div class="db-file-card__footer">
          <VscButton
            icon="codicon-save"
            size="small"
            :loading="false"
            :disabled="!dependencyReady"
            @click="connect"
          >
            {{ translator.t("connect.save", "Save") }}
          </VscButton>
        </div>
      </template>
    </div>
  </div>
</template>
