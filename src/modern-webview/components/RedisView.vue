<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import {
  applyTerminalConfiguration,
  DEFAULT_TERMINAL_SETTINGS,
  readTerminalSettings,
  type TerminalSettings,
} from "../terminalConfig";
import { normalizeRedisConsumerGroups, type RedisConsumerGroup } from "../../modern/database/redisValues";
import TerminalSettingsDialog from "./TerminalSettingsDialog.vue";
import UiSelect from "./UiSelect.vue";

interface RedisDetail {
  key?: string;
  type?: string;
  value?: unknown;
  ttl?: unknown;
  count?: unknown;
  prefix?: unknown;
  stack?: unknown;
  consumerGroups?: unknown;
  page?: unknown;
}

interface RedisRow {
  readonly [key: string]: unknown;
}

interface RedisStatusRow {
  readonly key: string;
  readonly value: string;
}

interface RedisStatus {
  readonly database: string;
  readonly tags: string[];
  readonly uptime: string;
  readonly connectedClients: string;
  readonly memoryUsage: string;
  readonly infoMap: Record<string, string>;
  readonly infoList: RedisStatusRow[];
}

interface NewKeyRow {
  field: string;
  value: string;
  score: string;
}

type RedisPanel = "status" | "data" | "terminal";
type RedisStringView = "Plain" | "JSON" | "Hex";
type RedisKeyType = "string" | "hash" | "list" | "set" | "zset" | "stream" | "ReJSON-RL";
type RedisStatusTab = "keys" | "info";
type RedisStreamTab = "entries" | "groups";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function json(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function numberValue(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isRedisKeyType(value: string): value is RedisKeyType {
  return ["string", "hash", "list", "set", "zset", "stream", "ReJSON-RL"].includes(value);
}

function isCollectionType(value: string | undefined): boolean {
  return value === "hash" || value === "list" || value === "set" || value === "zset";
}

function valueToEditableText(value: unknown): string {
  return typeof value === "string" ? value : json(value);
}

function toHex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function fromHex(value: string): string {
  const normalized = value.trim().replace(/^0x/i, "");
  if (!normalized || normalized.length % 2 !== 0 || /[^0-9a-f]/i.test(normalized)) return "";
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

function normalizeStreamValue(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const object: Record<string, unknown> = {};
  for (let index = 0; index + 1 < value.length; index += 2) {
    object[String(value[index])] = value[index + 1];
  }
  return object;
}

function normalizeRows(value: unknown, type: string): RedisRow[] {
  if (type === "hash") {
    const object = record(value);
    if (Object.keys(object).length > 0) {
      return Object.entries(object).map(([key, item]) => ({ key, value: item }));
    }
  }
  if (!Array.isArray(value)) {
    return value == null ? [] : [{ value }];
  }
  return value.map((item, index): RedisRow => {
    if (type === "list") return { index, value: item };
    if (type === "stream" && Array.isArray(item)) {
      return { id: item[0], value: normalizeStreamValue(item[1]) };
    }
    const row = record(item);
    if (Object.keys(row).length > 0) return { ...row, index };
    return { index, value: item };
  });
}

const initial = record(bootstrap.state);
const detail = reactive<RedisDetail>({
  key: typeof initial.key === "string" ? initial.key : "",
  type: typeof initial.type === "string" ? initial.type : "string",
  value: initial.value,
  ttl: initial.ttl,
  count: initial.count,
  prefix: initial.prefix,
  stack: initial.stack,
  consumerGroups: initial.consumerGroups,
  page: initial.page,
});

const keyName = ref(detail.key || "");
const valueText = ref(valueToEditableText(detail.value));
const stringView = ref<RedisStringView>(
  typeof detail.value === "object" && detail.value !== null ? "JSON" : "Plain",
);
const ttlText = ref(detail.ttl == null ? "-1" : String(detail.ttl));
const status = ref("");
const loading = ref(true);
const activePanel = ref<RedisPanel>("data");
const statusTab = ref<RedisStatusTab>("keys");
const streamTab = ref<RedisStreamTab>("entries");
const redisStatus = ref<RedisStatus>({
  database: "0",
  tags: [],
  uptime: "-",
  connectedClients: "0",
  memoryUsage: "-",
  infoMap: {},
  infoList: [],
});
const searchField = ref("");
const searchValue = ref("");
const pageNum = ref(1);
const pageSize = ref("100");
const editingItem = ref<RedisRow>();
const showItemEditor = ref(false);
const itemField = ref("");
const itemValue = ref("");
const itemScore = ref("0");
const itemIndex = ref<number>();
const itemPosition = ref<"head" | "tail">("tail");
const selectedGroup = ref<RedisConsumerGroup>();
const showNewKey = ref(false);
const newKeyName = ref(typeof initial.newKeyName === "string" ? initial.newKeyName : "");
const newKeyType = ref<RedisKeyType>("string");
const newKeyTtl = ref("");
const newKeyContent = ref("");
const newKeyRows = ref<NewKeyRow[]>([{ field: "", value: "", score: "0" }]);
const terminalSettingsVisible = ref(false);
const terminalSettings = ref<TerminalSettings>({ ...DEFAULT_TERMINAL_SETTINGS });
const redisStack = ref(initial.stack === true);
const newKeyRoute = initial.newKey === true;
const newKeyPrefix = typeof initial.newKeyName === "string"
  ? initial.newKeyName
  : typeof initial.prefix === "string" ? initial.prefix : "";

const redisPanels: ReadonlyArray<{ id: RedisPanel; label: string; icon: string }> = [
  { id: "status", label: "Status", icon: "codicon codicon-graph-line" },
  { id: "data", label: "Data", icon: "codicon codicon-database blue" },
  { id: "terminal", label: "Terminal", icon: "codicon codicon-terminal" },
];
const newKeyTypes = computed<ReadonlyArray<{ value: RedisKeyType; label: string }>>(() => [
  { value: "string", label: "STRING" },
  { value: "list", label: "LIST" },
  { value: "set", label: "SET" },
  { value: "zset", label: "ZSET" },
  { value: "hash", label: "HASH" },
  { value: "stream", label: "STREAM" },
  ...(redisStack.value ? [{ value: "ReJSON-RL" as const, label: "ReJSON-RL" }] : []),
]);
const pageSizes = ["20", "50", "100", "200", "300"];

let detailSubscription: BridgeDisposable | undefined;
let newKeySubscription: BridgeDisposable | undefined;
let paginationSubscription: BridgeDisposable | undefined;
let statusSubscription: BridgeDisposable | undefined;
let successSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;
let terminalConfigSubscription: BridgeDisposable | undefined;
let terminalResizeObserver: ResizeObserver | undefined;
const terminalContainer = ref<HTMLDivElement>();
const terminal = ref<Terminal>();
const terminalFitAddon = ref<FitAddon>();

const redisType = computed(() => detail.type || "string");
const isStringType = computed(() => redisType.value === "string" || redisType.value === "ReJSON-RL");
const isStreamType = computed(() => redisType.value === "stream");
const collectionType = computed(() => isCollectionType(redisType.value));
const rows = computed(() => normalizeRows(detail.value, redisType.value));
const filteredRows = computed(() => {
  const fieldNeedle = searchField.value.trim().toLowerCase();
  const valueNeedle = searchValue.value.trim().toLowerCase();
  return rows.value.filter((row) => {
    const field = text(row.key ?? row.field).toLowerCase();
    const value = json(row.value ?? row).toLowerCase();
    return (!fieldNeedle || field.includes(fieldNeedle)) && (!valueNeedle || value.includes(valueNeedle));
  });
});
const totalRows = computed(() => Math.max(0, numberValue(detail.count, filteredRows.value.length)));
const pageCount = computed(() => Math.max(1, Math.ceil(totalRows.value / numberValue(pageSize.value, 100))));
const keyStatistics = computed(() => Object.entries(redisStatus.value.infoMap)
  .filter(([key]) => key.startsWith("db"))
  .map(([db, value]) => {
    const fields = value.split(",");
    return {
      db,
      keys: fields.find((item) => item.startsWith("keys="))?.slice(5) || "0",
      expires: fields.find((item) => item.startsWith("expires="))?.slice(8) || "0",
      avg_ttl: fields.find((item) => item.startsWith("avg_ttl="))?.slice(8) || "0",
    };
  }));
const statusMetrics = computed(() => [
  { label: "Uptime", value: redisStatus.value.uptime },
  { label: "Memory Usage", value: redisStatus.value.memoryUsage },
  { label: "Connected Clients", value: redisStatus.value.connectedClients },
]);
const statusOs = computed(() => redisStatus.value.infoMap.os || "-");
const selectedGroupConsumers = computed(() => {
  const consumers = record(selectedGroup.value).consumerList;
  return Array.isArray(consumers) ? consumers : [];
});
const stringSize = computed(() => {
  const value = stringView.value === "Hex" ? fromHex(valueText.value) : valueText.value;
  return `${new TextEncoder().encode(value).length} B`;
});
const hexValue = computed(() => toHex(valueText.value));
const newKeyItemLabel = computed(() => {
  switch (newKeyType.value) {
    case "hash": return "Field";
    case "list": return "Element";
    case "set":
    case "zset": return "Member";
    case "stream": return "Entry";
    default: return "Value";
  }
});
const itemDialogTitle = computed(() => {
  const type = redisType.value.charAt(0).toUpperCase() + redisType.value.slice(1);
  return `${editingItem.value ? "Edit" : "Add to"} ${type}`;
});

function emit(type: string, content?: unknown): void {
  bridge?.emit(type, content);
}

function applyPage(page: unknown): void {
  const value = record(page);
  const nextPage = Math.max(1, numberValue(value.pageNum, numberValue(value.page, 1)));
  const nextSize = Math.max(1, numberValue(value.pageSize, numberValue(pageSize.value, 100)));
  pageNum.value = nextPage;
  pageSize.value = String(nextSize);
}

function applyDetail(content: unknown): void {
  loading.value = false;
  const payload = record(content);
  const nested = record(payload.res);
  const next = Object.keys(nested).length > 0 ? nested : payload;
  const nextKey = typeof next.key === "string"
    ? next.key
    : typeof next.name === "string" ? next.name : undefined;
  const hasValue = "value" in next || "content" in next;
  const nextValue = "value" in next ? next.value : next.content;
  Object.assign(detail, next, {
    ...(nextKey === undefined ? {} : { key: nextKey }),
    ...(hasValue ? { value: nextValue } : {}),
  });
  if (next.stack === true) redisStack.value = true;
  if (nextKey !== undefined) keyName.value = nextKey;
  if ("ttl" in next) ttlText.value = text(next.ttl, "-1");
  if (hasValue) {
    valueText.value = valueToEditableText(nextValue);
    stringView.value = typeof nextValue === "object" && nextValue !== null ? "JSON" : "Plain";
  }
  const page = next.page ?? payload.page;
  if (page) applyPage(page);
  else if (next.pageNum || next.pageSize) applyPage(next);
  selectedGroup.value = undefined;
}

function applyPagination(content: unknown): void {
  const payload = record(content);
  if (payload.page) applyPage(payload.page);
  applyDetail(payload);
}

function applyStatus(content: unknown): void {
  const payload = record(content);
  const infoMap = record(payload.infoMap);
  const infoList = Array.isArray(payload.infoList)
    ? payload.infoList.map((item): RedisStatusRow => {
      const row = record(item);
      return { key: text(row.key), value: text(row.value) };
    })
    : Object.entries(infoMap).map(([key, value]) => ({ key, value: text(value) }));
  redisStatus.value = {
    database: text(payload.database, "0"),
    tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
    uptime: text(payload.uptime, "-"),
    connectedClients: text(payload.connectedClients, "0"),
    memoryUsage: text(payload.memoryUsage, "-"),
    infoMap: Object.fromEntries(Object.entries(infoMap).map(([key, value]) => [key, text(value)])),
    infoList,
  };
}

function selectPanel(panel: RedisPanel): void {
  activePanel.value = panel;
  if (panel === "status") emit("initStatus");
}

function fitTerminal(): void {
  if (!terminal.value || !terminalFitAddon.value || !terminalContainer.value) return;
  if (terminalContainer.value.offsetParent === null) return;
  terminalFitAddon.value.fit();
  emit("resize", {
    cols: terminal.value.cols,
    rows: terminal.value.rows,
  });
}

function updateTerminalOption(change: {
  key: keyof TerminalSettings;
  value: TerminalSettings[keyof TerminalSettings];
}): void {
  if (change.key !== "terminalTheme") {
    emit("updateOption", { key: change.key, value: change.value });
  }
  applyTerminalConfiguration(terminal.value, terminalSettings.value);
  fitTerminal();
}

function createTerminal(): void {
  if (terminal.value || !terminalContainer.value) return;
  const instance = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontSize: 12,
    fontFamily: "var(--vscode-editor-font-family, ui-monospace, monospace)",
    theme: {
      background: "var(--vscode-terminal-background, #1e1e1e)",
      foreground: "var(--vscode-terminal-foreground, #cccccc)",
      cursor: "var(--vscode-terminalCursor-foreground, #ffffff)",
    },
  });
  const fit = new FitAddon();
  instance.loadAddon(fit);
  instance.open(terminalContainer.value);
  instance.onData((content) => emit("data", content));
  instance.onResize(({ cols, rows }) => emit("resize", { cols, rows }));
  terminal.value = instance;
  terminalFitAddon.value = fit;
  if (terminalResizeObserver) terminalResizeObserver.observe(terminalContainer.value);
  fitTerminal();
  emit("initTerminal", { cols: instance.cols, rows: instance.rows });
}

function selectStringView(value: string): void {
  if (value === "Plain" || value === "JSON" || value === "Hex") stringView.value = value;
}

function selectNewKeyType(value: string): void {
  if (isRedisKeyType(value)) newKeyType.value = value;
  newKeyRows.value = [{ field: "", value: "", score: "0" }];
}

function resetNewKey(): void {
  newKeyName.value = "";
  newKeyType.value = "string";
  newKeyTtl.value = "";
  newKeyContent.value = "";
  newKeyRows.value = [{ field: "", value: "", score: "0" }];
}

function openNewKey(): void {
  resetNewKey();
  showNewKey.value = true;
}

function prepareNewKey(content: unknown): void {
  const payload = record(content);
  if (payload.stack === true) redisStack.value = true;
  resetNewKey();
  newKeyName.value = text(payload.prefix, newKeyRoute ? newKeyPrefix : "");
  showNewKey.value = true;
}

function closeNewKey(): void {
  showNewKey.value = false;
}

function addNewKeyRow(): void {
  newKeyRows.value.push({ field: "", value: "", score: "0" });
}

function removeNewKeyRow(index: number): void {
  if (newKeyRows.value.length > 1) newKeyRows.value.splice(index, 1);
}

function createKey(): void {
  const name = newKeyName.value.trim();
  if (!name) {
    status.value = "A new Redis key name is required.";
    return;
  }
  const payload: Record<string, unknown> = {
    name,
    type: newKeyType.value,
    ttl: newKeyTtl.value === "" ? -1 : numberValue(newKeyTtl.value, -1),
  };
  if (newKeyType.value === "string" || newKeyType.value === "ReJSON-RL") payload.content = newKeyContent.value;
  if (newKeyType.value === "hash") {
    const items = newKeyRows.value.filter((row) => row.field.trim());
    if (items.length === 0) {
      status.value = "At least one Redis hash field is required.";
      return;
    }
    payload.hashItems = items;
  }
  if (newKeyType.value === "list") {
    const items = newKeyRows.value.filter((row) => row.value !== "");
    if (items.length === 0) {
      status.value = "At least one Redis list element is required.";
      return;
    }
    payload.listItems = items;
  }
  if (newKeyType.value === "set") {
    const items = newKeyRows.value.filter((row) => row.value.trim());
    if (items.length === 0) {
      status.value = "At least one Redis set member is required.";
      return;
    }
    payload.setItems = items;
  }
  if (newKeyType.value === "zset") {
    const items = newKeyRows.value.filter((row) => row.value.trim());
    if (items.length === 0) {
      status.value = "At least one Redis sorted-set member is required.";
      return;
    }
    payload.zsetItems = items;
  }
  if (newKeyType.value === "stream") {
    const items = newKeyRows.value.filter((row) => row.field.trim());
    if (items.length === 0) {
      status.value = "At least one Redis stream field is required.";
      return;
    }
    payload.streamItems = items;
  }
  emit("createKey", { key: payload });
  showNewKey.value = false;
}

function parseStringValue(): unknown {
  if (stringView.value === "Hex") return valueText.value;
  if (stringView.value !== "JSON" && redisType.value !== "ReJSON-RL") return valueText.value;
  try {
    return JSON.parse(valueText.value);
  } catch {
    status.value = "The Redis value is not valid JSON.";
    return undefined;
  }
}

function saveValue(): void {
  const value = parseStringValue();
  if (value === undefined) return;
  emit("update", {
    key: {
      name: keyName.value,
      newName: keyName.value,
      type: redisType.value,
      ttl: numberValue(ttlText.value, -1),
      contentMode: stringView.value === "Hex" ? "hex" : "plain",
      isBinary: false,
      content: value,
    },
  });
}

function updateTtl(): void {
  const ttl = Number(ttlText.value);
  if (!Number.isFinite(ttl)) {
    status.value = "Redis TTL must be a number.";
    return;
  }
  emit("ttl", { key: { name: keyName.value, ttl } });
}

function rename(): void {
  const next = keyName.value.trim();
  if (!next) {
    status.value = "Key name cannot be empty.";
    return;
  }
  emit("rename", { key: { name: detail.key || keyName.value, newName: next } });
}

function remove(): void {
  if (!window.confirm("Delete this Redis key?")) return;
  emit("del", { key: { name: detail.key || keyName.value } });
}

async function copyText(value: unknown): Promise<void> {
  const content = json(value);
  if (!content) return;
  try {
    await navigator.clipboard.writeText(content);
    status.value = "Copied.";
  } catch {
    emit("copyText", content);
  }
}

function rowValue(row: RedisRow): string {
  return json(row.value ?? row);
}

function rowKey(row: RedisRow): string {
  return text(row.id ?? row.index ?? row.key ?? row.field ?? row.value);
}

function beginItem(row?: RedisRow): void {
  editingItem.value = row;
  const value = row ? record(row) : {};
  itemField.value = text(value.key ?? value.field);
  itemValue.value = text(value.value ?? (row && redisType.value === "stream" ? "" : value));
  itemScore.value = text(value.score, "0");
  itemIndex.value = Number.isInteger(Number(value.index)) ? Number(value.index) : undefined;
  itemPosition.value = "tail";
  showItemEditor.value = true;
}

function closeItemEditor(): void {
  showItemEditor.value = false;
  editingItem.value = undefined;
}

function saveItem(): void {
  const type = redisType.value;
  if (type === "hash" && !itemField.value.trim()) {
    status.value = "Hash field cannot be empty.";
    return;
  }
  if (type === "stream") {
    emit("saveItem", {
      keyName: keyName.value,
      type,
      streamItems: [{ field: itemField.value, value: itemValue.value }],
    });
  } else {
    emit("saveItem", {
      keyName: keyName.value,
      type,
      old: editingItem.value,
      key: itemField.value,
      value: itemValue.value,
      score: itemScore.value,
      index: itemIndex.value,
      position: itemPosition.value,
    });
  }
  closeItemEditor();
}

function deleteItem(row: RedisRow): void {
  if (!window.confirm("Delete this Redis item?")) return;
  emit("deleteLine", row);
}

function changePage(page: number): void {
  const next = Math.min(Math.max(1, page), pageCount.value);
  pageNum.value = next;
  emit("changePage", { pageNum: next, pageSize: numberValue(pageSize.value, 100) });
}

function changePageSize(value: string): void {
  pageSize.value = value;
  changePage(1);
}

function groupValue(group: RedisConsumerGroup, name: string): string {
  return text(group[name], "-");
}

function toggleGroup(group: RedisConsumerGroup): void {
  selectedGroup.value = selectedGroup.value?.name === group.name ? undefined : group;
}

function deleteConsumerGroup(group: RedisConsumerGroup): void {
  if (!group.name || !window.confirm(`Delete Redis consumer group "${group.name}"?`)) return;
  emit("deleteConsumerGroup", { name: group.name });
}

function formatDuration(value: unknown): string {
  const milliseconds = numberValue(value, 0);
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

onMounted(() => {
  detailSubscription = bridge?.on("detail", applyDetail);
  newKeySubscription = bridge?.on("newKey", prepareNewKey);
  paginationSubscription = bridge?.on("pagination", applyPagination);
  statusSubscription = bridge?.on("status", applyStatus);
  terminalConfigSubscription = bridge?.on("terminalConfig", (content) => {
    terminalSettings.value = readTerminalSettings(content, terminalSettings.value);
    applyTerminalConfiguration(terminal.value, content);
    fitTerminal();
  });
  successSubscription = bridge?.on("success", (content) => { status.value = text(content); });
  errorSubscription = bridge?.on("error", (content) => {
    status.value = text(record(content).message || content, "Redis action failed.");
  });
  bridge?.init("keyView");
  emit("terminalConfig");
  emit("initStatus");
  terminalResizeObserver = typeof ResizeObserver === "undefined"
    ? undefined
    : new ResizeObserver(() => fitTerminal());
  window.addEventListener("resize", fitTerminal);
});

watch(activePanel, (panel) => {
  if (panel === "terminal") void nextTick(createTerminal);
});

onBeforeUnmount(() => {
  detailSubscription?.dispose();
  paginationSubscription?.dispose();
  statusSubscription?.dispose();
  terminalConfigSubscription?.dispose();
  successSubscription?.dispose();
  errorSubscription?.dispose();
  newKeySubscription?.dispose();
  terminalResizeObserver?.disconnect();
  window.removeEventListener("resize", fitTerminal);
  emit("closeTerminal");
  terminal.value?.dispose();
  terminal.value = undefined;
  terminalFitAddon.value = undefined;
});
</script>

<template>
  <section
    class="redis-view-container"
    data-route="keyView"
  >
    <div
      v-if="loading"
      class="redis-loading"
    >
      loading
    </div>
    <div
      v-else
      class="redis-body"
    >
      <div
        id="redisMainTab"
        class="redis-tabbar"
      >
        <ul class="tab redis-main-tabs">
          <li
            v-for="panel in redisPanels"
            :key="panel.id"
            class="tab__item"
            :class="{ 'tab__item--active': activePanel === panel.id }"
            @click="selectPanel(panel.id)"
          >
            <i
              class="panel-icon"
              :class="panel.icon"
              aria-hidden="true"
            />
            {{ panel.label }}
          </li>
        </ul>
        <div
          v-if="activePanel === 'terminal'"
          class="redis-terminal-actions"
        >
          <button
            class="redis-terminal-actions__item"
            type="button"
            @click="terminalSettingsVisible = true"
          >
            <i class="codicon codicon-settings-gear" aria-hidden="true" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      <div
        v-if="activePanel !== 'terminal'"
        class="redis-content"
      >
        <div
          v-if="activePanel === 'status'"
          id="statusPanel"
          class="redis-key-status"
        >
          <div class="redis-key-status__overview">
            <div class="redis-key-status__overview-top">
              <div class="redis-key-status__identity">
                <span class="redis-key-status__db-badge">DB {{ redisStatus.database }}</span>
                <span
                  v-for="tag in redisStatus.tags"
                  :key="tag"
                  class="redis-key-status__tag"
                >
                  {{ tag }}
                </span>
              </div>
              <VscButton
                title="Refresh"
                @click="emit('refreshStatus')"
              >
                <i class="codicon codicon-refresh" aria-hidden="true" />
              </VscButton>
            </div>
            <div class="redis-key-status__overview-meta">
              <i class="codicon codicon-server" aria-hidden="true" />
              <span class="redis-key-status__meta-label">OS</span>
              <span
                class="redis-key-status__meta-value"
                :title="statusOs"
              >
                {{ statusOs }}
              </span>
            </div>
          </div>
          <div class="redis-key-status__metrics">
            <div
              v-for="metric in statusMetrics"
              :key="metric.label"
              class="redis-key-status__metric"
            >
              <div class="redis-key-status__metric-label">{{ metric.label }}</div>
              <div class="redis-key-status__metric-value">{{ metric.value }}</div>
            </div>
          </div>
          <div class="redis-key-status__subtabs">
            <button
              type="button"
              class="redis-key-status__subtab"
              :class="{ 'redis-key-status__subtab--active': statusTab === 'keys' }"
              @click="statusTab = 'keys'"
            >
              Key Statistics
            </button>
            <button
              type="button"
              class="redis-key-status__subtab"
              :class="{ 'redis-key-status__subtab--active': statusTab === 'info' }"
              @click="statusTab = 'info'"
            >
              Status Info
            </button>
          </div>
          <div class="redis-table-wrap">
            <table class="result-view__table">
              <thead>
                <tr v-if="statusTab === 'keys'">
                  <th>DB</th>
                  <th>Keys</th>
                  <th>Expires</th>
                  <th>Avg TTL</th>
                </tr>
                <tr v-else>
                  <th>Key</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody v-if="statusTab === 'keys'">
                <tr
                  v-for="row in keyStatistics"
                  :key="row.db"
                >
                  <td>{{ row.db }}</td>
                  <td>{{ row.keys }}</td>
                  <td>{{ row.expires }}</td>
                  <td>{{ row.avg_ttl }}</td>
                </tr>
                <tr v-if="keyStatistics.length === 0">
                  <td colspan="4" class="redis-empty">No key statistics</td>
                </tr>
              </tbody>
              <tbody v-else>
                <tr
                  v-for="row in redisStatus.infoList"
                  :key="row.key"
                >
                  <td>{{ row.key }}</td>
                  <td>{{ row.value }}</td>
                </tr>
                <tr v-if="redisStatus.infoList.length === 0">
                  <td colspan="2" class="redis-empty">No status info</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <template v-else>
          <div
            id="panel"
            class="redis-key-panel"
          >
            <div class="redis-key-row redis-key-row--name">
              <span class="key-label key-detail-type">{{ redisType }}</span>
              <input
                v-model="keyName"
                class="field__input redis-key-name-input"
                placeholder="Please input key name"
                @keyup.enter="rename"
              >
              <VscButton
                title="Copy"
                @click="copyText(keyName)"
              >
                <i class="codicon codicon-copy" aria-hidden="true" />
              </VscButton>
              <VscButton
                title="New key"
                @click="openNewKey"
              >
                <i class="codicon codicon-add" aria-hidden="true" />
              </VscButton>
            </div>
            <div class="redis-key-row redis-key-row--ttl">
              <span class="key-label">TTL</span>
              <input
                v-model="ttlText"
                class="field__input redis-ttl-input"
                @keyup.enter="updateTtl"
              >
              <VscButton
                title="Save TTL"
                @click="updateTtl"
              >
                <i class="codicon codicon-save" aria-hidden="true" />
              </VscButton>
              <VscButton
                title="Delete key"
                type="danger"
                @click="remove"
              >
                <i class="codicon codicon-trash" aria-hidden="true" />
              </VscButton>
            </div>
          </div>

          <div
            v-if="isStringType"
            id="stringPanel"
            class="redis-content-section"
          >
            <div class="redis-toolbar">
              <span class="redis-toolbar__meta">Size: {{ stringSize }}</span>
              <UiSelect
                :model-value="stringView"
                class="redis-toolbar__select"
                :options="redisType === 'string' ? ['Plain', 'JSON', 'Hex'] : ['JSON', 'Plain']"
                @update:model-value="selectStringView"
              />
              <VscButton
                title="Refresh"
                @click="emit('refresh')"
              >
                <i class="codicon codicon-refresh" aria-hidden="true" />
              </VscButton>
              <VscButton @click="saveValue">
                <i class="codicon codicon-save" aria-hidden="true" />
                <span>Save</span>
              </VscButton>
            </div>
            <pre
              v-if="stringView === 'Hex'"
              class="redis-hex-panel"
            >{{ hexValue }}</pre>
            <textarea
              v-else
              v-model="valueText"
              class="redis-editor-panel"
              spellcheck="false"
            />
          </div>

          <div
            v-else-if="collectionType"
            id="listPanel"
            class="redis-content-section"
          >
            <div class="redis-toolbar">
              <input
                v-if="redisType === 'hash'"
                v-model="searchField"
                class="field__input redis-toolbar__search--field"
                placeholder="Search field"
              >
              <input
                v-model="searchValue"
                class="field__input redis-toolbar__search"
                placeholder="Search"
              >
              <VscButton
                title="Refresh"
                @click="emit('refresh')"
              >
                <i class="codicon codicon-refresh" aria-hidden="true" />
              </VscButton>
              <VscButton
                title="Add new item"
                @click="beginItem()"
              >
                <i class="codicon codicon-add yellow" aria-hidden="true" />
              </VscButton>
              <div class="redis-pagination">
                <VscButton
                  title="Previous page"
                  :disabled="pageNum <= 1"
                  @click="changePage(pageNum - 1)"
                >
                  ‹
                </VscButton>
                <span>{{ pageNum }} / {{ pageCount }}</span>
                <VscButton
                  title="Next page"
                  :disabled="pageNum >= pageCount"
                  @click="changePage(pageNum + 1)"
                >
                  ›
                </VscButton>
                <UiSelect
                  :model-value="pageSize"
                  :options="pageSizes"
                  @update:model-value="changePageSize"
                />
              </div>
            </div>
            <div class="redis-table-wrap">
              <table class="result-view__table">
                <thead>
                  <tr>
                    <th v-if="redisType === 'list'">Index</th>
                    <th v-if="redisType === 'hash'">Field</th>
                    <th v-if="redisType === 'zset'">Score</th>
                    <th>{{ redisType === 'list' ? 'Element' : redisType === 'hash' ? 'Value' : 'Member' }}</th>
                    <th>Operation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in filteredRows"
                    :key="rowKey(row)"
                  >
                    <td v-if="redisType === 'list'">{{ text(row.index) }}</td>
                    <td v-if="redisType === 'hash'">{{ text(row.key) }}</td>
                    <td v-if="redisType === 'zset'">{{ text(row.score) }}</td>
                    <td>
                      <span
                        class="item-value"
                        :title="rowValue(row)"
                      >
                        {{ rowValue(row) }}
                      </span>
                    </td>
                    <td>
                      <div class="redis-op-buttons">
                        <VscButton
                          title="Copy"
                          @click="copyText(row.value ?? row)"
                        >
                          <i class="codicon codicon-copy" aria-hidden="true" />
                        </VscButton>
                        <VscButton
                          title="Edit"
                          @click="beginItem(row)"
                        >
                          <i class="codicon codicon-edit yellow" aria-hidden="true" />
                        </VscButton>
                        <VscButton
                          title="Delete"
                          type="danger"
                          @click="deleteItem(row)"
                        >
                          <i class="codicon codicon-trash" aria-hidden="true" />
                        </VscButton>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="filteredRows.length === 0">
                    <td
                      :colspan="redisType === 'list' || redisType === 'hash' || redisType === 'zset' ? 3 : 2"
                      class="redis-empty"
                    >
                      <i class="codicon codicon-database" aria-hidden="true" />
                      No data
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div
            v-else-if="isStreamType"
            id="streamPanel"
            class="redis-content-section"
          >
            <ul class="tab redis-stream-tabs">
              <li
                class="tab__item"
                :class="{ 'tab__item--active': streamTab === 'entries' }"
                @click="streamTab = 'entries'"
              >
                <i class="codicon codicon-list-unordered blue" aria-hidden="true" />
                Entries
              </li>
              <li
                class="tab__item"
                :class="{ 'tab__item--active': streamTab === 'groups' }"
                @click="streamTab = 'groups'"
              >
                <i class="codicon codicon-combine" aria-hidden="true" />
                Groups
              </li>
            </ul>
            <div
              v-if="streamTab === 'entries'"
              class="redis-toolbar"
            >
              <input
                v-model="searchValue"
                class="field__input redis-toolbar__search"
                placeholder="Search"
              >
              <VscButton
                title="Refresh"
                @click="emit('refresh')"
              >
                <i class="codicon codicon-refresh" aria-hidden="true" />
              </VscButton>
              <VscButton
                title="Add entry"
                @click="beginItem()"
              >
                <i class="codicon codicon-add yellow" aria-hidden="true" />
              </VscButton>
              <div class="redis-pagination">
                <VscButton
                  title="Previous page"
                  :disabled="pageNum <= 1"
                  @click="changePage(pageNum - 1)"
                >
                  ‹
                </VscButton>
                <span>{{ pageNum }} / {{ pageCount }}</span>
                <VscButton
                  title="Next page"
                  :disabled="pageNum >= pageCount"
                  @click="changePage(pageNum + 1)"
                >
                  ›
                </VscButton>
              </div>
            </div>
            <div
              v-else
              class="redis-toolbar"
            >
              <VscButton
                title="Refresh"
                @click="emit('refresh')"
              >
                <i class="codicon codicon-refresh" aria-hidden="true" />
              </VscButton>
            </div>
            <div
              v-if="streamTab === 'entries'"
              class="redis-table-wrap"
            >
              <table class="result-view__table">
                <thead>
                  <tr><th>ID</th><th>Entry</th><th>Operation</th></tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in filteredRows"
                    :key="rowKey(row)"
                  >
                    <td>{{ text(row.id) }}</td>
                    <td>
                      <span class="item-value" :title="rowValue(row)">{{ rowValue(row) }}</span>
                    </td>
                    <td>
                      <div class="redis-op-buttons">
                        <VscButton title="Copy" @click="copyText(row.value ?? row)">
                          <i class="codicon codicon-copy" aria-hidden="true" />
                        </VscButton>
                        <VscButton type="danger" title="Delete" @click="deleteItem(row)">
                          <i class="codicon codicon-trash" aria-hidden="true" />
                        </VscButton>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="filteredRows.length === 0">
                    <td colspan="3" class="redis-empty">No entries</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              v-else
              class="redis-table-wrap"
            >
              <table class="result-view__table">
                <thead>
                  <tr><th>Name</th><th>Consumers</th><th>Pending</th><th>Last Delivered ID</th><th>Operation</th></tr>
                </thead>
                <tbody>
                  <tr
                    v-for="group in normalizeRedisConsumerGroups(detail.consumerGroups)"
                    :key="group.name"
                    :class="{ 'redis-row--selected': selectedGroup?.name === group.name }"
                    @click="toggleGroup(group)"
                  >
                    <td>{{ group.name }}</td>
                    <td>{{ groupValue(group, 'consumers') }}</td>
                    <td>{{ groupValue(group, 'pending') }}</td>
                    <td>{{ groupValue(group, 'last-delivered-id') }}</td>
                    <td>
                      <VscButton
                        type="danger"
                        title="Delete"
                        @click.stop="deleteConsumerGroup(group)"
                      >
                        <i class="codicon codicon-trash" aria-hidden="true" />
                      </VscButton>
                    </td>
                  </tr>
                  <tr v-if="normalizeRedisConsumerGroups(detail.consumerGroups).length === 0">
                    <td colspan="5" class="redis-empty">No consumer groups</td>
                  </tr>
                </tbody>
              </table>
              <div
                v-if="selectedGroup"
                class="redis-stream-consumers"
              >
                <div class="redis-stream-consumers__title">Consumers of {{ selectedGroup.name }}</div>
                <table class="result-view__table">
                  <thead><tr><th>Name</th><th>Pending</th><th>Idle</th></tr></thead>
                  <tbody>
                    <tr
                      v-for="consumer in selectedGroupConsumers"
                      :key="text(record(consumer).name)"
                    >
                      <td>{{ text(record(consumer).name) }}</td>
                      <td>{{ text(record(consumer).pending, "-") }}</td>
                      <td>{{ formatDuration(record(consumer).idle) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <p
            v-if="status"
            class="route-workspace__status"
          >
            {{ status }}
          </p>
        </template>
      </div>

      <div
        v-if="activePanel === 'terminal'"
        class="redis-content redis-terminal-panel"
      >
        <div
          ref="terminalContainer"
          class="xterm-container redis-terminal"
          tabindex="0"
          aria-label="Redis terminal"
        />
      </div>
    </div>

    <div
      v-if="showItemEditor"
      class="redis-modal"
      role="presentation"
      @click.self="closeItemEditor"
    >
      <div
        class="redis-modal__panel new-item-dialog"
        role="dialog"
        aria-modal="true"
      >
        <div class="redis-modal__header">
          <strong>{{ itemDialogTitle }}</strong>
          <button type="button" class="redis-modal__close" @click="closeItemEditor">×</button>
        </div>
        <div class="redis-modal__body">
          <label
            v-if="redisType === 'list' && !editingItem"
            class="inline-block mr-10"
          >
            <span class="common_input_label">Position</span>
            <select v-model="itemPosition" class="field__input">
              <option value="head">Head</option>
              <option value="tail">Tail</option>
            </select>
          </label>
          <label
            v-if="redisType === 'hash' || redisType === 'stream'"
            class="inline-block mr-10"
          >
            <span class="common_input_label">{{ redisType === 'stream' ? 'Field' : 'Field' }}</span>
            <input v-model="itemField" class="field__input">
          </label>
          <label
            v-if="redisType === 'zset'"
            class="inline-block mr-10"
          >
            <span class="common_input_label">Score</span>
            <input v-model="itemScore" class="field__input">
          </label>
          <label class="inline-block mr-10">
            <span class="common_input_label">{{ redisType === 'list' ? 'Element' : redisType === 'stream' ? 'Value' : 'Value' }}</span>
            <textarea v-model="itemValue" class="console-view__editor" />
          </label>
        </div>
        <div class="redis-modal__footer">
          <VscButton type="default" @click="closeItemEditor">Cancel</VscButton>
          <VscButton @click="saveItem">Confirm</VscButton>
        </div>
      </div>
    </div>

    <div
      v-if="showNewKey"
      class="redis-modal"
      role="presentation"
      @click.self="closeNewKey"
    >
      <div
        class="redis-modal__panel redis-new-key-dialog"
        role="dialog"
        aria-modal="true"
      >
        <div class="redis-modal__header">
          <strong>New Redis key</strong>
          <button type="button" class="redis-modal__close" @click="closeNewKey">×</button>
        </div>
        <div class="redis-modal__body redis-new-key-form">
          <label class="inline-block mr-10">
            <span class="common_input_label">Key name</span>
            <input v-model="newKeyName" class="field__input" placeholder="redis:key">
          </label>
          <label class="inline-block mr-10">
            <span class="common_input_label">Type</span>
            <select
              class="field__input"
              :value="newKeyType"
              @change="selectNewKeyType(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="option in newKeyTypes"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="inline-block mr-10">
            <span class="common_input_label">TTL</span>
            <input v-model="newKeyTtl" class="field__input" placeholder="-1">
          </label>
          <label
            v-if="newKeyType === 'string' || newKeyType === 'ReJSON-RL'"
            class="inline-block mr-10"
          >
            <span class="common_input_label">{{ newKeyType === 'ReJSON-RL' ? 'JSON' : 'Value' }}</span>
            <textarea v-model="newKeyContent" class="console-view__editor" />
          </label>
          <div
            v-else
            class="inline-block mr-10"
          >
            <span class="common_input_label">{{ newKeyItemLabel }}</span>
            <div class="redis-new-key-list">
              <div
                v-for="(row, index) in newKeyRows"
                :key="index"
                class="redis-new-key-row"
              >
                <input
                  v-if="newKeyType === 'hash' || newKeyType === 'stream'"
                  v-model="row.field"
                  class="field__input"
                  :placeholder="newKeyType === 'stream' ? 'Field' : 'Field'"
                >
                <input
                  v-if="newKeyType === 'zset'"
                  v-model="row.score"
                  class="field__input redis-new-key-row__score"
                  placeholder="Score"
                >
                <input
                  v-model="row.value"
                  class="field__input"
                  placeholder="Value"
                >
                <VscButton
                  v-if="newKeyRows.length > 1"
                  type="danger"
                  title="Remove row"
                  @click="removeNewKeyRow(index)"
                >
                  <i class="codicon codicon-trash" aria-hidden="true" />
                </VscButton>
              </div>
              <VscButton
                class="redis-new-key-add"
                type="default"
                @click="addNewKeyRow"
              >
                <i class="codicon codicon-add" aria-hidden="true" />
                Add row
              </VscButton>
            </div>
          </div>
        </div>
        <div class="redis-modal__footer">
          <VscButton type="default" @click="closeNewKey">Cancel</VscButton>
          <VscButton @click="createKey">Confirm</VscButton>
        </div>
      </div>
    </div>

    <TerminalSettingsDialog
      v-model="terminalSettingsVisible"
      :settings="terminalSettings"
      @change="updateTerminalOption"
    />
  </section>
</template>
