<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import { createTranslator } from "../i18n";

interface ElasticsearchNodeStatus {
  readonly ip?: unknown;
  readonly name?: unknown;
  readonly isMain?: unknown;
  readonly heapPercent?: unknown;
  readonly diskUsage?: unknown;
  readonly cpuUsage?: unknown;
  readonly load_5m?: unknown;
  readonly "segments.count"?: unknown;
  readonly "segments.memory"?: unknown;
  readonly "disk.used"?: unknown;
  readonly "disk.total"?: unknown;
  readonly [key: string]: unknown;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const translator = createTranslator(bootstrap.language);
const initial = bootstrap.state.esStatus;
const nodes = ref<ElasticsearchNodeStatus[]>([]);
const message = ref("");
const viewportHeight = ref(
  typeof window === "undefined" ? 0 : Math.max(0, window.innerHeight - 30),
);
let statusSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

const columns = [
  { key: "ip", labelKey: "esStatus.ip", fallback: "IP", className: "ip" },
  { key: "name", labelKey: "esStatus.name", fallback: "Name", className: "name" },
  { key: "master", labelKey: "esStatus.master", fallback: "Master", className: "master" },
  { key: "heap", labelKey: "esStatus.heapUsage", fallback: "Heap usage", className: "metric" },
  { key: "diskUsage", labelKey: "esStatus.diskUsage", fallback: "Disk usage", className: "metric" },
  { key: "cpu", labelKey: "esStatus.cpuUsage", fallback: "CPU usage", className: "metric" },
  { key: "load", labelKey: "esStatus.load5m", fallback: "Load (5m)", className: "load" },
  { key: "segmentsCount", labelKey: "esStatus.segmentsCount", fallback: "Segments", className: "segments" },
  { key: "segmentsSize", labelKey: "esStatus.segmentsSize", fallback: "Segment memory", className: "segments" },
  { key: "diskUsed", labelKey: "esStatus.diskUsed", fallback: "Disk used", className: "disk" },
  { key: "diskTotal", labelKey: "esStatus.diskTotal", fallback: "Disk total", className: "disk" },
] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = "-"): string {
  return value == null || value === "" ? fallback : String(value);
}

function isNodeStatus(value: unknown): value is ElasticsearchNodeStatus {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function applyStatus(content: unknown): void {
  nodes.value = Array.isArray(content)
    ? content.filter(isNodeStatus)
    : [];
  message.value = "";
}

function emit(type: "esStatus"): void {
  bridge?.emit(type);
}

function updateViewportHeight(): void {
  viewportHeight.value = Math.max(0, window.innerHeight - 30);
}

function percentage(value: unknown): number {
  const parsed = Number.parseInt(text(value, "0").replace("%", ""), 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
}

function progressStyle(value: unknown): Record<string, string> {
  return {
    width: `${percentage(value)}%`,
    background: progressColor(value),
  };
}

function progressColor(value: unknown): string {
  const parsed = Number.parseInt(text(value, "0").replace("%", ""), 10);
  if (parsed > 90) return "var(--vscode-charts-red)";
  if (parsed > 60) return "var(--vscode-charts-yellow)";
  return "var(--vscode-charts-green)";
}

function valueFromInitial(): ElasticsearchNodeStatus[] {
  return Array.isArray(initial) ? initial.filter(isNodeStatus) : [];
}

const emptyMessage = computed(() => message.value || translator.t(
  "esStatus.empty",
  "No Elasticsearch nodes found.",
));

nodes.value = valueFromInitial();

onMounted(() => {
  statusSubscription = bridge?.on("esStatus", applyStatus);
  errorSubscription = bridge?.on("error", (content) => {
    message.value = text(record(content).message || content, "Elasticsearch status request failed.");
  });
  bridge?.emit("esStatus");
  updateViewportHeight();
  window.addEventListener("resize", updateViewportHeight);
});

onBeforeUnmount(() => {
  statusSubscription?.dispose();
  errorSubscription?.dispose();
  window.removeEventListener("resize", updateViewportHeight);
});
</script>

<template>
  <div
    class="es-status"
    :style="{ height: `${viewportHeight}px` }"
    data-route="esStatus"
  >
    <div class="es-status__toolbar">
      <div class="es-status__title">
        <i class="codicon codicon-server es-status__icon" aria-hidden="true" />
        <span>{{ translator.t("esStatus.node", "Node") }}</span>
        <button
          class="vsc-button vsc-button--icon"
          type="button"
          :title="translator.t('common.refresh', 'Refresh')"
          @click="emit('esStatus')"
        >
          <i class="codicon codicon-refresh" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="es-status__list-wrap">
      <div class="es-status__list">
        <div class="es-status__header">
          <span
            v-for="column in columns"
            :key="column.key"
            class="es-status__col"
            :class="`es-status__col--${column.className}`"
          >
            {{ translator.t(column.labelKey, column.fallback) }}
          </span>
        </div>

        <div
          v-if="nodes.length === 0"
          class="es-status__empty"
        >
          <i class="codicon codicon-server es-status__empty-icon" aria-hidden="true" />
          <span>{{ emptyMessage }}</span>
        </div>

        <div
          v-for="(node, index) in nodes"
          :key="`${text(node.ip)}-${text(node.name)}-${index}`"
          class="es-status__row"
        >
          <span class="es-status__col es-status__col--ip">
            <span class="es-status__mono" :title="text(node.ip)">{{ text(node.ip) }}</span>
          </span>
          <span class="es-status__col es-status__col--name">
            <span class="es-status__name" :title="text(node.name)">{{ text(node.name) }}</span>
          </span>
          <span class="es-status__col es-status__col--master">
            <span
              class="es-status__master"
              :class="node.isMain ? 'es-status__master--yes' : 'es-status__master--no'"
            >
              {{ node.isMain
                ? translator.t("esStatus.yes", "Yes")
                : translator.t("esStatus.no", "No") }}
            </span>
          </span>
          <span class="es-status__col es-status__col--metric">
            <span class="es-progress">
              <span class="es-progress__track">
                <span class="es-progress__fill" :style="progressStyle(node.heapPercent)" />
              </span>
              <span class="es-progress__label">{{ text(node.heapPercent) }}</span>
            </span>
          </span>
          <span class="es-status__col es-status__col--metric">
            <span class="es-progress">
              <span class="es-progress__track">
                <span class="es-progress__fill" :style="progressStyle(node.diskUsage)" />
              </span>
              <span class="es-progress__label">{{ text(node.diskUsage) }}</span>
            </span>
          </span>
          <span class="es-status__col es-status__col--metric">
            <span class="es-progress">
              <span class="es-progress__track">
                <span class="es-progress__fill" :style="progressStyle(node.cpuUsage)" />
              </span>
              <span class="es-progress__label">{{ text(node.cpuUsage) }}</span>
            </span>
          </span>
          <span class="es-status__col es-status__col--load">
            <span class="es-status__mono">{{ text(node.load_5m) }}</span>
          </span>
          <span class="es-status__col es-status__col--segments">
            <span class="es-status__mono">{{ text(node["segments.count"]) }}</span>
          </span>
          <span class="es-status__col es-status__col--segments">
            <span class="es-status__mono">{{ text(node["segments.memory"]) }}</span>
          </span>
          <span class="es-status__col es-status__col--disk">
            <span class="es-status__mono">{{ text(node["disk.used"]) }}</span>
          </span>
          <span class="es-status__col es-status__col--disk">
            <span class="es-status__mono">{{ text(node["disk.total"]) }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
