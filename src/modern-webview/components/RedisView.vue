<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";
import UiInput from "./UiInput.vue";

interface RedisDetail {
  key?: string;
  type?: string;
  value?: unknown;
  ttl?: unknown;
  count?: unknown;
  prefix?: unknown;
  consumerGroups?: unknown;
}

interface RedisRow {
  readonly [key: string]: unknown;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const initial = bootstrap.state as RedisDetail;
const detail = reactive<RedisDetail>({
  key: typeof initial.key === "string" ? initial.key : "",
  type: typeof initial.type === "string" ? initial.type : "string",
  value: initial.value,
  ttl: initial.ttl,
  count: initial.count,
  prefix: initial.prefix,
  consumerGroups: initial.consumerGroups,
});
const keyName = ref(detail.key || "");
const valueText = ref("");
const ttlText = ref(detail.ttl == null ? "-1" : String(detail.ttl));
const renameText = ref(detail.key || "");
const status = ref("");
const redisStatus = ref<unknown>();
let detailSubscription: BridgeDisposable | undefined;
let paginationSubscription: BridgeDisposable | undefined;
let statusSubscription: BridgeDisposable | undefined;
let successSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

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

function parseValue(value: string): unknown {
  if (detail.type === "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function applyDetail(content: unknown): void {
  const payload = record(content);
  const nested = record(payload.res);
  const next = Object.keys(nested).length > 0 ? nested : payload;
  Object.assign(detail, next);
  if (typeof next.key === "string") {
    keyName.value = next.key;
    renameText.value = next.key;
  }
  if (typeof next.type === "string") {
    detail.type = next.type;
  }
  if ("value" in next) valueText.value = json(next.value);
  if ("ttl" in next) ttlText.value = text(next.ttl, "-1");
}

function applyPagination(content: unknown): void {
  if (Array.isArray(content)) {
    applyDetail({ value: content });
    return;
  }
  applyDetail(content);
}

function valueRows(): RedisRow[] {
  const value = detail.value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      const row = record(item);
      return Object.keys(row).length > 0 ? row : { value: item };
    });
  }
  const object = record(value);
  if (Object.keys(object).length > 0) {
    return Object.entries(object).map(([key, item]) => ({ key, value: item }));
  }
  return [{ value }];
}

const rows = computed(() => valueRows());
const columns = computed(() => {
  const names = new Set<string>();
  for (const row of rows.value) {
    for (const name of Object.keys(row)) names.add(name);
  }
  return [...names];
});

function cell(value: unknown): string {
  return json(value);
}

function emit(type: string, content?: unknown): void {
  bridge?.emit(type, content);
}

function saveValue(): void {
  emit("update", { value: parseValue(valueText.value), type: detail.type });
}

function updateTtl(): void {
  emit("ttl", { ttl: Number(ttlText.value) });
}

function rename(): void {
  const next = renameText.value.trim();
  if (!next) {
    status.value = "Key name cannot be empty.";
    return;
  }
  emit("rename", { name: next });
  keyName.value = next;
}

function remove(): void {
  emit("del");
}

const statusText = computed(() => {
  if (typeof redisStatus.value === "string") return redisStatus.value;
  const value = record(redisStatus.value);
  const entries = Object.entries(value).slice(0, 5);
  return entries.length > 0
    ? entries.map(([name, item]) => `${name}: ${text(item)}`).join(" · ")
    : "";
});

onMounted(() => {
  detailSubscription = bridge?.on("detail", applyDetail);
  paginationSubscription = bridge?.on("pagination", applyPagination);
  statusSubscription = bridge?.on("status", (content) => { redisStatus.value = content; });
  successSubscription = bridge?.on("success", (content) => { status.value = text(content); });
  errorSubscription = bridge?.on("error", (content) => {
    status.value = text(record(content).message || content, "Redis action failed.");
  });
  bridge?.init("keyView");
  emit("initStatus");
});

onBeforeUnmount(() => {
  detailSubscription?.dispose();
  paginationSubscription?.dispose();
  statusSubscription?.dispose();
  successSubscription?.dispose();
  errorSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace redis-view"
    data-route="keyView"
  >
    <header class="route-workspace__header">
      <div>
        <h1>Redis key</h1>
        <p class="route-workspace__subline">
          {{ detail.type || "string" }} · {{ keyName || "No key selected" }}
        </p>
      </div>
      <div class="route-workspace__actions">
        <UiButton
          type="button"
          @click="emit('refresh')"
        >
          Refresh
        </UiButton>
        <UiButton
          type="button"
          variant="danger"
          @click="remove"
        >
          Delete key
        </UiButton>
      </div>
    </header>

    <div class="connection-view__grid">
      <UiInput
        v-model="renameText"
        label="Key"
        placeholder="Redis key"
      />
      <UiInput
        v-model="ttlText"
        label="TTL (seconds)"
        type="number"
      />
      <div class="route-workspace__actions">
        <UiButton
          type="button"
          @click="rename"
        >
          Rename
        </UiButton>
        <UiButton
          type="button"
          @click="updateTtl"
        >
          Update TTL
        </UiButton>
      </div>
    </div>

    <label class="vsc-field vsc-field--wide">
      <span class="vsc-field__label">Value</span>
      <textarea
        v-model="valueText"
        class="console-view__editor"
        :placeholder="detail.type === 'string' ? 'Redis value' : 'JSON value or collection items'"
      />
    </label>
    <div class="route-workspace__actions">
      <UiButton
        type="button"
        @click="saveValue"
      >
        Save value
      </UiButton>
      <span class="route-workspace__subline">
        TTL: {{ detail.ttl ?? "-1" }} · Items: {{ detail.count ?? rows.length }}
      </span>
    </div>

    <p
      v-if="statusText || status"
      class="route-workspace__status"
    >
      {{ status || statusText }}
    </p>

    <div
      v-if="rows.length > 0"
      class="result-view__table-wrap"
    >
      <table class="result-view__table">
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column"
            >
              {{ column }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in rows"
            :key="index"
          >
            <td
              v-for="column in columns"
              :key="column"
            >
              {{ cell(row[column]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
