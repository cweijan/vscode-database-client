<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import {
  applyTerminalConfiguration,
  DEFAULT_TERMINAL_SETTINGS,
  readTerminalSettings,
  type TerminalSettings,
} from "../terminalConfig";
import TerminalSettingsDialog from "./TerminalSettingsDialog.vue";
import UiSelect from "./UiSelect.vue";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const terminalContainer = ref<HTMLDivElement>();
const terminal = ref<Terminal>();
const fitAddon = ref<FitAddon>();
const query = ref("");
const previousMinute = ref("30");
const live = ref(true);
const lastTime = ref(0);
const hasLog = ref(false);
const error = ref("");
const terminalHasData = ref(false);
const terminalSettingsVisible = ref(false);
const terminalSettings = ref<TerminalSettings>({ ...DEFAULT_TERMINAL_SETTINGS });
const state = reactive({
  parentLabel: "",
  labelName: "",
});
const timeRanges = [
  { value: "15", label: "Last 15 minutes" },
  { value: "30", label: "Last 30 minutes" },
  { value: "60", label: "Last 1 hour" },
  { value: "120", label: "Last 2 hours" },
  { value: "180", label: "Last 3 hours" },
  { value: "1440", label: "Last 24 hours" },
  { value: "2880", label: "Last 2 days" },
  { value: "10080", label: "Last 7 days" },
];
const queryPlaceholder = '{job="api"} |= ""';
const title = computed(() => state.parentLabel && state.labelName
  ? `${state.parentLabel}=${state.labelName}`
  : "Loki logs");
let subscriptions: BridgeDisposable[] = [];
let liveTimer: number | undefined;
let resizeObserver: ResizeObserver | undefined;

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fitTerminal(): void {
  if (!terminal.value || !fitAddon.value || !terminalContainer.value) return;
  if (terminalContainer.value.offsetParent === null) return;
  fitAddon.value.fit();
  bridge?.emit("resize", {
    cols: terminal.value.cols,
    rows: terminal.value.rows,
  });
}

function createTerminal(): void {
  if (terminal.value || !terminalContainer.value) return;
  const instance = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "var(--vscode-editor-font-family, ui-monospace, monospace)",
    theme: {
      background: "var(--vscode-editor-background, #1e1e1e)",
      foreground: "var(--vscode-terminal-foreground, #cccccc)",
      cursor: "var(--vscode-terminalCursor-foreground, #ffffff)",
    },
  });
  const fit = new FitAddon();
  instance.loadAddon(fit);
  instance.open(terminalContainer.value);
  terminal.value = instance;
  fitAddon.value = fit;
  fitTerminal();
}

function requestLogs(): void {
  error.value = "";
  bridge?.emit("getLogs", {
    query: query.value.trim() || undefined,
    previousMinute: Math.max(1, Number(previousMinute.value) || 30),
    live: live.value,
    start: live.value && lastTime.value > 0 ? lastTime.value : undefined,
    hasLog: hasLog.value,
  });
}

function openDocumentation(): void {
  bridge?.emit("openDocument");
}

function appendTerminalData(content: unknown): void {
  const value = text(content);
  if (!terminal.value || !value) return;
  if (!terminalHasData.value) {
    terminal.value.clear();
    terminalHasData.value = true;
  }
  terminal.value.write(value);
}

function selectLive(value: boolean): void {
  live.value = value;
  if (value) requestLogs();
}

function updateTerminalOption(change: {
  key: keyof TerminalSettings;
  value: TerminalSettings[keyof TerminalSettings];
}): void {
  if (change.key !== "terminalTheme") {
    bridge?.emit("updateOption", { key: change.key, value: change.value });
  }
  applyTerminalConfiguration(terminal.value, terminalSettings.value);
  fitTerminal();
}

onMounted(() => {
  createTerminal();
  const terminalConfigSubscription = bridge?.on("terminalConfig", (content) => {
    terminalSettings.value = readTerminalSettings(content, terminalSettings.value);
    applyTerminalConfiguration(terminal.value, content);
    fitTerminal();
  });
  const stateSubscription = bridge?.on("setState", (content) => {
    const source = record(content);
    if (typeof source.parentLabel === "string") state.parentLabel = source.parentLabel;
    if (typeof source.labelName === "string") state.labelName = source.labelName;
  });
  const querySubscription = bridge?.on("query", (content) => {
    if (typeof content === "string" && !query.value) query.value = content;
  });
  const dataSubscription = bridge?.on("data", appendTerminalData);
  const lastTimeSubscription = bridge?.on("lastTime", (content) => {
    const source = record(content);
    const value = Number(source.lastTime);
    if (Number.isFinite(value)) lastTime.value = value;
    hasLog.value = source.hasLog === true;
  });
  const errorSubscription = bridge?.on("error", (content) => {
    error.value = text(record(content).message || content, "Loki request failed");
    appendTerminalData(`\r\n${error.value}\r\n`);
  });
  subscriptions = [
    stateSubscription,
    terminalConfigSubscription,
    querySubscription,
    dataSubscription,
    lastTimeSubscription,
    errorSubscription,
  ].filter((subscription): subscription is BridgeDisposable => Boolean(subscription));
  resizeObserver = typeof ResizeObserver === "undefined"
    ? undefined
    : new ResizeObserver(() => fitTerminal());
  if (resizeObserver && terminalContainer.value) resizeObserver.observe(terminalContainer.value);
  window.addEventListener("resize", fitTerminal);
  liveTimer = window.setInterval(() => {
    if (live.value && lastTime.value > 0) requestLogs();
  }, 3000);
  bridge?.init("lokiLog");
  bridge?.emit("terminalConfig");
});

onBeforeUnmount(() => {
  if (liveTimer !== undefined) window.clearInterval(liveTimer);
  resizeObserver?.disconnect();
  window.removeEventListener("resize", fitTerminal);
  for (const subscription of subscriptions) subscription.dispose();
  terminal.value?.dispose();
  terminal.value = undefined;
  fitAddon.value = undefined;
});
</script>

<template>
  <section
    class="route-workspace loki-log-view xterm-root"
    data-route="lokiLog"
  >
    <div class="loki-toolbar">
      <div class="loki-toolbar__group loki-toolbar__group--query">
        <i
          class="codicon codicon-search loki-toolbar__search-icon"
          aria-hidden="true"
        />
        <input
          v-model="query"
          class="vsc-input loki-toolbar__input"
          :placeholder="queryPlaceholder"
          @keyup.enter="requestLogs"
        >
        <VscButton
          title="Run query"
          @click="requestLogs"
        >
          <i class="codicon codicon-play text-base green" aria-hidden="true" />
        </VscButton>
        <VscButton
          title="Query documentation"
          type="default"
          @click="openDocumentation"
        >
          <i class="codicon codicon-notebook text-base" aria-hidden="true" />
        </VscButton>
      </div>
      <div class="loki-toolbar__divider" />
      <div class="loki-toolbar__group">
        <i
          class="codicon codicon-clock loki-toolbar__field-icon"
          aria-hidden="true"
        />
        <UiSelect
          :model-value="previousMinute"
          class="loki-toolbar__range"
          :options="timeRanges"
          @update:model-value="previousMinute = $event; requestLogs()"
        />
      </div>
      <div class="loki-toolbar__group loki-toolbar__group--live">
        <label
          class="loki-toolbar__live-label"
          :class="{ 'loki-toolbar__live-label--active': live }"
        >
          <span
            v-if="live"
            class="loki-toolbar__live-dot"
          />
          Live
        </label>
        <input
          :checked="live"
          type="checkbox"
          aria-label="Live polling"
          @change="selectLive(($event.target as HTMLInputElement).checked)"
        >
      </div>
      <div class="loki-toolbar__spacer" />
      <div class="loki-toolbar__actions">
        <VscButton
          title="Refresh"
          type="default"
          @click="requestLogs"
        >
          <i class="codicon codicon-refresh text-base" aria-hidden="true" />
        </VscButton>
        <VscButton
          title="Settings"
          @click="terminalSettingsVisible = true"
        >
          <i class="codicon codicon-settings-gear text-base" aria-hidden="true" />
        </VscButton>
      </div>
    </div>
    <div
      ref="terminalContainer"
      class="xterm-container loki-log-view__terminal"
      tabindex="0"
      :aria-label="title"
    />
    <p
      v-if="error"
      class="route-workspace__error"
    >
      {{ error }}
    </p>
    <TerminalSettingsDialog
      v-model="terminalSettingsVisible"
      :settings="terminalSettings"
      @change="updateTerminalOption"
    />
  </section>
</template>
