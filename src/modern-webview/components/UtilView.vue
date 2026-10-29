<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";

interface ComputedValue {
  md5: string;
  sha1: string;
  sha256: string;
  base64Encode: string;
  base64Decode: string;
  prettyBytes: string;
  urlEncode: string;
  urlDecode: string;
}

interface RandomValue {
  uuid: string;
  username: string;
  password: string;
}

interface SystemProcess {
  pid: number;
  ppid?: number;
  name: string;
  user: string;
  cpu: string;
  memory: string;
  runtime: string;
  command: string;
}

interface ProcessSnapshot {
  platform?: string;
  currentUser?: string;
  selfPid?: number;
  rows?: SystemProcess[];
}

type UtilityTab = "common" | "taskManager";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const tab = ref<UtilityTab>("common");
const source = ref("");
const encodingMode = ref<"base64" | "url" | "unicode">("base64");
const computedValue = reactive<ComputedValue>({
  md5: "",
  sha1: "",
  sha256: "",
  base64Encode: "",
  base64Decode: "",
  prettyBytes: "",
  urlEncode: "",
  urlDecode: "",
});
const randomValue = reactive<RandomValue>({
  uuid: "",
  username: "",
  password: "",
});
const timestamp = ref(Date.now());
const dateText = ref(formatDate(timestamp.value));
const processRows = ref<SystemProcess[]>([]);
const processLoading = ref(false);
const processError = ref("");
const processFilter = ref("");
const onlyCurrentUser = ref(false);
const platform = ref(bootstrap.config?.platform ? String(bootstrap.config.platform) : "");
const currentUser = ref("");
const selfPid = ref(0);
const killingPid = ref(0);
let subscriptions: BridgeDisposable[] = [];

const unicodeEncode = computed(() => encodeUnicode(source.value));
const unicodeDecode = computed(() => decodeUnicode(source.value));

const filteredProcesses = computed(() => {
  const filter = processFilter.value.trim().toLowerCase();
  return processRows.value.filter((row) => {
    if (onlyCurrentUser.value && currentUser.value && row.user !== currentUser.value) return false;
    if (!filter) return true;
    return [row.name, row.pid, row.user, row.command]
      .some((value) => String(value || "").toLowerCase().includes(filter));
  });
});

function formatDate(value: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function messageText(content: unknown, fallback: string): string {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const message = (content as { message?: unknown }).message;
    if (message) return String(message);
  }
  return content ? String(content) : fallback;
}

function compute(): void {
  bridge?.emit("computeValue", source.value);
}

function applyComputed(content: unknown): void {
  if (!content || typeof content !== "object" || Array.isArray(content)) return;
  const value = content as Partial<ComputedValue>;
  for (const key of Object.keys(computedValue) as (keyof ComputedValue)[]) {
    if (value[key] !== undefined) computedValue[key] = String(value[key]);
  }
}

function applyRandom(content: unknown): void {
  if (!content || typeof content !== "object" || Array.isArray(content)) return;
  const value = content as Partial<RandomValue>;
  randomValue.uuid = String(value.uuid || "");
  randomValue.username = String(value.username || "");
  randomValue.password = String(value.password || "");
}

function applyProcesses(content: unknown): void {
  if (!content || typeof content !== "object" || Array.isArray(content)) return;
  const value = content as ProcessSnapshot;
  processLoading.value = false;
  processError.value = "";
  platform.value = String(value.platform || "");
  currentUser.value = String(value.currentUser || "");
  selfPid.value = Number(value.selfPid || 0);
  processRows.value = Array.isArray(value.rows) ? value.rows : [];
}

function loadProcesses(): void {
  processLoading.value = true;
  processError.value = "";
  bridge?.emit("getSystemProcesses");
}

function killProcess(row: SystemProcess): void {
  if (row.pid === selfPid.value || killingPid.value) return;
  killingPid.value = row.pid;
  bridge?.emit("killSystemProcess", { pid: row.pid });
}

function updateTimestamp(value: string): void {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  timestamp.value = parsed < 100000000000 ? parsed * 1000 : parsed;
  dateText.value = formatDate(timestamp.value);
}

function updateDate(value: string): void {
  const parsed = new Date(value.replace(" ", "T")).getTime();
  if (!Number.isFinite(parsed)) return;
  timestamp.value = parsed;
  dateText.value = formatDate(timestamp.value);
}

function encodeUnicode(value: string): string {
  const safeCharacter = /[A-Za-z0-9@*_+\-.\/]/;
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] || "";
    const code = value.charCodeAt(index);
    if (safeCharacter.test(character)) result += character;
    else if (code < 256) result += `%${code.toString(16).toUpperCase().padStart(2, "0")}`;
    else result += `/u${code.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return result;
}

function decodeUnicode(value: string): string {
  return value.replace(
    /\/u([0-9a-f]{4})|%([0-9a-f]{2})/gi,
    (_match, unicodeCode: string | undefined, byteCode: string | undefined) =>
      String.fromCharCode(Number.parseInt(unicodeCode || byteCode || "0", 16)),
  );
}

onMounted(() => {
  subscriptions = [
    bridge?.on("computedValue", applyComputed),
    bridge?.on("randomValue", applyRandom),
    bridge?.on("systemProcesses", applyProcesses),
    bridge?.on("systemProcessKilled", (content) => {
      killingPid.value = 0;
      processError.value = messageText(content, "Process ended.");
      loadProcesses();
    }),
    bridge?.on("systemProcessError", (content) => {
      processLoading.value = false;
      killingPid.value = 0;
      processError.value = messageText(content, "Process operation failed.");
    }),
    bridge?.on("error", (content) => { processError.value = messageText(content, "Utility operation failed."); }),
  ].filter((item): item is BridgeDisposable => Boolean(item));
  bridge?.init("util");
  compute();
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <section
    class="route-workspace util-view"
    data-route="util"
  >
    <header class="route-workspace__header">
      <div>
        <h1>Utilities</h1>
        <p class="route-workspace__subline">
          Hash, encode, timestamp and local process tools from the target utility surface.
        </p>
      </div>
    </header>

    <nav
      class="util-view__tabs"
      aria-label="Utility tools"
    >
      <button
        class="util-view__tab"
        :class="{ 'util-view__tab--active': tab === 'common' }"
        type="button"
        @click="tab = 'common'"
      >
        Common
      </button>
      <button
        class="util-view__tab"
        :class="{ 'util-view__tab--active': tab === 'taskManager' }"
        type="button"
        @click="tab = 'taskManager'; loadProcesses()"
      >
        Task Manager
      </button>
    </nav>

    <div
      v-if="tab === 'common'"
      class="util-view__common"
    >
      <article class="util-view__section">
        <h2>Input</h2>
        <textarea
          v-model="source"
          class="vsc-input util-view__source"
          placeholder="Enter text to calculate hashes or encode values"
          spellcheck="false"
          @input="compute"
        />
      </article>

      <article class="util-view__section">
        <h2>Hash</h2>
        <label class="vsc-field">
          <span class="vsc-field__label">MD5</span>
          <input
            class="vsc-input"
            :value="computedValue.md5"
            readonly
          >
        </label>
        <label class="vsc-field">
          <span class="vsc-field__label">SHA1</span>
          <input
            class="vsc-input"
            :value="computedValue.sha1"
            readonly
          >
        </label>
        <label class="vsc-field">
          <span class="vsc-field__label">SHA256</span>
          <input
            class="vsc-input"
            :value="computedValue.sha256"
            readonly
          >
        </label>
        <label class="vsc-field">
          <span class="vsc-field__label">Pretty bytes</span>
          <input
            class="vsc-input"
            :value="computedValue.prettyBytes"
            readonly
          >
        </label>
      </article>

      <article class="util-view__section">
        <h2>Encode / Decode</h2>
        <select
          v-model="encodingMode"
          class="vsc-input"
        >
          <option value="base64">
            Base64
          </option>
          <option value="url">
            URL
          </option>
          <option value="unicode">
            Unicode
          </option>
        </select>
        <template v-if="encodingMode === 'base64'">
          <label class="vsc-field">
            <span class="vsc-field__label">Base64 encode</span>
            <textarea
              class="vsc-input"
              :value="computedValue.base64Encode"
              readonly
            />
          </label>
          <label class="vsc-field">
            <span class="vsc-field__label">Base64 decode</span>
            <textarea
              class="vsc-input"
              :value="computedValue.base64Decode"
              readonly
            />
          </label>
        </template>
        <template v-else-if="encodingMode === 'url'">
          <label class="vsc-field">
            <span class="vsc-field__label">URL encode</span>
            <textarea
              class="vsc-input"
              :value="computedValue.urlEncode"
              readonly
            />
          </label>
          <label class="vsc-field">
            <span class="vsc-field__label">URL decode</span>
            <textarea
              class="vsc-input"
              :value="computedValue.urlDecode"
              readonly
            />
          </label>
        </template>
        <template v-else>
          <label class="vsc-field">
            <span class="vsc-field__label">Unicode encode</span>
            <textarea
              class="vsc-input"
              :value="unicodeEncode"
              readonly
            />
          </label>
          <label class="vsc-field">
            <span class="vsc-field__label">Unicode decode</span>
            <textarea
              class="vsc-input"
              :value="unicodeDecode"
              readonly
            />
          </label>
        </template>
      </article>

      <article class="util-view__section">
        <div class="util-view__section-header">
          <h2>Random Generator</h2>
          <VscButton
            @click="bridge?.emit('getRandom')"
          >
            Generate
          </VscButton>
        </div>
        <label class="vsc-field">
          <span class="vsc-field__label">Username</span>
          <input
            class="vsc-input"
            :value="randomValue.username"
            readonly
          >
        </label>
        <label class="vsc-field">
          <span class="vsc-field__label">Password</span>
          <input
            class="vsc-input"
            :value="randomValue.password"
            readonly
          >
        </label>
        <label class="vsc-field">
          <span class="vsc-field__label">UUID</span>
          <input
            class="vsc-input"
            :value="randomValue.uuid"
            readonly
          >
        </label>
      </article>

      <article class="util-view__section">
        <h2>Timestamp Converter</h2>
        <label class="vsc-field">
          <span class="vsc-field__label">Timestamp</span>
          <input
            class="vsc-input"
            :value="timestamp"
            type="number"
            @input="updateTimestamp(($event.target as HTMLInputElement).value)"
          >
        </label>
        <label class="vsc-field">
          <span class="vsc-field__label">Date</span>
          <input
            class="vsc-input"
            :value="dateText"
            @input="updateDate(($event.target as HTMLInputElement).value)"
          >
        </label>
      </article>
    </div>

    <section
      v-else
      class="util-view__section util-view__processes"
    >
      <div class="util-view__section-header">
        <div>
          <h2>Task Manager</h2>
          <p class="route-workspace__subline">
            {{ platform || "-" }} · {{ currentUser || "-" }}
          </p>
        </div>
        <VscButton
          :disabled="processLoading"
          @click="loadProcesses"
        >
          {{ processLoading ? "Loading…" : "Refresh" }}
        </VscButton>
      </div>
      <div class="util-view__process-toolbar">
        <input
          v-model="processFilter"
          class="vsc-input"
          placeholder="Search name, PID, user or command"
        >
        <label class="util-view__checkbox">
          <input
            v-model="onlyCurrentUser"
            type="checkbox"
            :disabled="!currentUser"
          >
          Only current user
        </label>
      </div>
      <p
        v-if="processError"
        class="route-workspace__status"
      >
        {{ processError }}
      </p>
      <div class="util-view__table-wrap">
        <table class="util-view__table">
          <thead>
            <tr>
              <th>Process</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>User</th>
              <th>PID</th>
              <th>Runtime</th>
              <th>Command</th>
              <th>Kill</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredProcesses"
              :key="row.pid"
            >
              <td>{{ row.name || "-" }}</td>
              <td>{{ row.cpu || "-" }}</td>
              <td>{{ row.memory || "-" }}</td>
              <td>{{ row.user || "-" }}</td>
              <td>{{ row.pid }}</td>
              <td>{{ row.runtime || "-" }}</td>
              <td
                class="util-view__command"
                :title="row.command"
              >
                {{ row.command || row.name || "-" }}
              </td>
              <td>
                <VscButton
                  type="danger"
                  :disabled="row.pid === selfPid || killingPid !== 0"
                  @click="killProcess(row)"
                >
                  {{ killingPid === row.pid ? "…" : "Kill" }}
                </VscButton>
              </td>
            </tr>
            <tr v-if="!processLoading && filteredProcesses.length === 0">
              <td
                colspan="8"
                class="util-view__empty"
              >
                {{ processRows.length ? "No process matched the filter." : "No process data available." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>
