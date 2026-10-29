<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import { copyText } from "../clipboard";
import { createTranslator } from "../i18n";
import MetricBar from "./target/MetricBar.vue";

interface MonitorServer {
  key: string;
  name: string;
  host: string;
  monitored?: boolean;
}

interface MonitorMetric extends MonitorServer {
  online?: boolean;
  metricsLoading?: boolean;
  cpu?: number;
  memory?: number;
  memoryUsed?: number;
  memoryTotal?: number;
  disk?: number;
  diskUsed?: string;
  diskTotal?: string;
  netRx?: number;
  netTx?: number;
  error?: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const translator = createTranslator(readWebviewBootstrap().language);

const setup = ref(true);
const filter = ref("");
const servers = ref<MonitorServer[]>([]);
const monitoredKeys = ref<string[]>([]);
const metrics = ref<MonitorMetric[]>([]);
const selectedKeys = ref<string[]>([]);
const tableRef = ref<{ clearSelection: () => void; toggleRowSelection: (row: unknown, value?: boolean) => void } | null>(null);
const subscriptions: (BridgeDisposable | undefined)[] = [];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function normalizeServer(value: unknown): MonitorServer {
  const source = record(value);
  return {
    key: text(source.key),
    name: text(source.name, text(source.key)),
    host: text(source.host),
    monitored: source.monitored === true,
  };
}

function normalizeMetric(value: unknown): MonitorMetric {
  const source = record(value);
  const numberValue = (key: string): number | undefined =>
    typeof source[key] === "number" ? source[key] as number : undefined;
  return {
    ...normalizeServer(value),
    online: source.online === true,
    metricsLoading: source.metricsLoading === true,
    cpu: numberValue("cpu"),
    memory: numberValue("memory"),
    memoryUsed: numberValue("memoryUsed"),
    memoryTotal: numberValue("memoryTotal"),
    disk: numberValue("disk"),
    diskUsed: source.diskUsed == null ? undefined : String(source.diskUsed),
    diskTotal: source.diskTotal == null ? undefined : String(source.diskTotal),
    netRx: numberValue("netRx"),
    netTx: numberValue("netTx"),
    error: source.error == null ? undefined : String(source.error),
  };
}

const filtered = computed(() => {
  const value = filter.value.trim().toLowerCase();
  if (!value) return metrics.value;
  return metrics.value.filter((entry) =>
    entry.name?.toLowerCase().includes(value)
    || entry.host?.toLowerCase().includes(value)
    || entry.key?.toLowerCase().includes(value));
});

function throughput(rx: number | undefined, tx: number | undefined): string {
  const total = (rx ?? 0) + (tx ?? 0);
  return total ? `${(total / 1024 / 1024).toFixed(2)} MB/s` : "0 MB/s";
}

function usagePair(used: string | undefined, total: string | undefined): string {
  return !used || !total ? "" : `${used}/${total}`;
}

function onTableSelectionChange(rows: Record<string, unknown>[]): void {
  selectedKeys.value = rows.map((row) => String(row.key));
}

function onTableRowClick(row: Record<string, unknown>): void {
  openStatus(String(row.key));
}

async function syncSelection(): Promise<void> {
  await Promise.resolve();
  if (!tableRef.value) return;
  tableRef.value.clearSelection();
  for (const row of servers.value) {
    if (row.monitored) tableRef.value.toggleRowSelection(row, true);
  }
  selectedKeys.value = servers.value.filter((row) => row.monitored).map((row) => row.key);
}

function loadServers(): void {
  bridge?.emit("load");
}

function refresh(): void {
  bridge?.emit("refresh");
}

function saveMonitored(): void {
  bridge?.emit("saveMonitored", selectedKeys.value);
  setup.value = selectedKeys.value.length > 0;
}

function manage(): void {
  setup.value = true;
  void syncSelection();
}

function openStatus(key: string): void {
  bridge?.emit("openStatus", key);
}

function openTerminal(key: string): void {
  bridge?.emit("openTerminal", key);
}

function remove(key: string): void {
  metrics.value = metrics.value.filter((entry) => entry.key !== key);
  bridge?.emit("remove", key);
}

function applyMetricUpdate(content: unknown): void {
  const update = normalizeServer(content);
  const index = metrics.value.findIndex((entry) => entry.key === update.key);
  if (index < 0) return;
  Object.assign(metrics.value[index], content as MonitorMetric);
}

onMounted(() => {
  subscriptions.push(
    bridge?.on("serverList", (content) => {
      servers.value = Array.isArray(content) ? content.map(normalizeServer) : [];
      void syncSelection();
    }),
    bridge?.on("monitoredKeys", (content) => {
      monitoredKeys.value = Array.isArray(content) ? content.map((entry) => String(entry)) : [];
      setup.value = monitoredKeys.value.length === 0;
    }),
    bridge?.on("metrics", (content) => {
      metrics.value = Array.isArray(content) ? content.map(normalizeMetric) : [];
    }),
    bridge?.on("metricUpdate", applyMetricUpdate),
  );
  bridge?.init("sshMonitor");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription?.dispose();
});
</script>

<template>
  <div class="monitor-page">
    <div
      v-if="setup"
      class="setup-panel"
    >
      <div class="header-row">
        <h2 class="page-title">
          {{ translator.t("sshMonitor.selectServers", "Select servers") }}
        </h2>
        <VscButton
          size="micro"
          icon="codicon-refresh"
          @click="loadServers"
        />
      </div>
      <VscTable
        ref="tableRef"
        :data="servers"
        row-key="key"
        reserve-selection
        @selection-change="onTableSelectionChange"
      >
        <VscTableColumn
          type="selection"
          width="48"
        />
        <VscTableColumn
          prop="name"
          :label="translator.t('sshMonitor.system', 'System')"
          min-width="160"
        />
        <VscTableColumn
          prop="host"
          :label="translator.t('sshMonitor.host', 'Host')"
          min-width="180"
        />
      </VscTable>
      <div class="action-row">
        <VscButton
          type="primary"
          @click="saveMonitored"
        >
          {{ translator.t("sshMonitor.startMonitor", "Start monitor") }}
        </VscButton>
        <VscButton
          v-if="monitoredKeys.length"
          type="secondary"
          @click="setup = false"
        >
          {{ translator.t("common.cancel", "Cancel") }}
        </VscButton>
      </div>
    </div>

    <div
      v-else
      class="dashboard-panel"
    >
      <div class="header-row">
        <div>
          <h2 class="page-title">
            {{ translator.t("sshMonitor.title", "SSH monitor") }}
          </h2>
          <p class="page-subtitle">
            {{ translator.t("sshMonitor.subtitle", "Live metrics from the monitored servers") }}
          </p>
        </div>
        <div class="header-actions">
          <input
            v-model="filter"
            class="filter-input"
            :placeholder="translator.t('sshMonitor.filter', 'Filter')"
          >
          <VscButton
            size="micro"
            icon="codicon-refresh"
            :title="translator.t('common.refresh', 'Refresh')"
            @click="refresh"
          />
          <VscButton
            size="micro"
            icon="codicon-settings-gear"
            @click="manage"
          >
            {{ translator.t("sshMonitor.manage", "Manage") }}
          </VscButton>
        </div>
      </div>
      <VscTable
        class="monitor-metrics-table"
        :data="filtered"
        row-key="key"
        @row-click="onTableRowClick"
      >
        <VscTableColumn
          :label="translator.t('sshMonitor.system', 'System')"
          min-width="160"
        >
          <template #default="{ row }">
            <div class="system-cell">
              <span
                class="status-dot"
                :class="{ online: row.online, offline: !row.online }"
              />
              <span class="system-name">{{ row.name }}</span>
            </div>
          </template>
        </VscTableColumn>
        <VscTableColumn
          :label="translator.t('sshMonitor.host', 'Host')"
          min-width="120"
        >
          <template #default="{ row }">
            <span
              class="host-text"
              @click.stop="void copyText(String(row.host ?? ''))"
            >{{ row.host }}</span>
          </template>
        </VscTableColumn>
        <VscTableColumn
          :label="translator.t('sshMonitor.cpu', 'CPU')"
          width="140"
        >
          <template #default="{ row }">
            <MetricBar
              :value="row.cpu"
              :loading="row.metricsLoading"
              :error="row.error"
            />
          </template>
        </VscTableColumn>
        <VscTableColumn
          :label="translator.t('sshMonitor.memory', 'Memory')"
          width="140"
        >
          <template #default="{ row }">
            <VscTooltip
              :title="usagePair(row.memoryUsed, row.memoryTotal)"
              :disabled="!usagePair(row.memoryUsed, row.memoryTotal)"
            >
              <MetricBar
                :value="row.memory"
                :loading="row.metricsLoading"
                :error="row.error"
              />
            </VscTooltip>
          </template>
        </VscTableColumn>
        <VscTableColumn
          :label="translator.t('sshMonitor.disk', 'Disk')"
          width="140"
        >
          <template #default="{ row }">
            <VscTooltip
              :title="usagePair(row.diskUsed, row.diskTotal)"
              :disabled="!usagePair(row.diskUsed, row.diskTotal)"
            >
              <MetricBar
                :value="row.disk"
                :loading="row.metricsLoading"
                :error="row.error"
              />
            </VscTooltip>
          </template>
        </VscTableColumn>
        <VscTableColumn
          :label="translator.t('sshMonitor.network', 'Network')"
          width="100"
        >
          <template #default="{ row }">
            <span
              v-if="row.metricsLoading"
              class="text-muted"
            >...</span>
            <span
              v-else-if="row.error"
              class="text-error"
            >-</span>
            <span v-else>{{ throughput(row.netRx, row.netTx) }}</span>
          </template>
        </VscTableColumn>
        <VscTableColumn
          width="100"
          align="center"
        >
          <template #default="{ row }">
            <VscButton
              type="icon"
              icon="codicon-terminal"
              size="micro"
              :title="translator.t('sshMonitor.terminal', 'Terminal')"
              @click.stop="openTerminal(row.key)"
            />
            <VscButton
              type="icon"
              icon="codicon-trash"
              size="micro"
              class="del-btn"
              :title="translator.t('sshMonitor.remove', 'Remove')"
              @click.stop="remove(row.key)"
            />
          </template>
        </VscTableColumn>
      </VscTable>
    </div>
  </div>
</template>
