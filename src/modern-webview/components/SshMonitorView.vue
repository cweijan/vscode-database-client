<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import UiInput from "./UiInput.vue";

interface MonitorServer {
  readonly key: string;
  readonly name: string;
  readonly host: string;
  readonly monitored?: boolean;
}

interface MonitorMetric extends MonitorServer {
  readonly online: boolean;
  readonly metricsLoading: boolean;
  readonly cpu?: number;
  readonly memory?: number;
  readonly memoryUsed?: number;
  readonly memoryTotal?: number;
  readonly disk?: number;
  readonly diskUsed?: string;
  readonly diskTotal?: string;
  readonly netRx?: number;
  readonly netTx?: number;
  readonly error?: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const setup = ref(true);
const filter = ref("");
const servers = ref<MonitorServer[]>([]);
const monitoredKeys = ref<string[]>([]);
const metrics = ref<MonitorMetric[]>([]);
const status = ref("");
const subscriptions: BridgeDisposable[] = [];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function bool(value: unknown): boolean {
  return value === true;
}

function normalizeServer(value: unknown): MonitorServer | undefined {
  const source = record(value);
  const key = text(source.key);
  if (!key) return undefined;
  return {
    key,
    name: text(source.name, key),
    host: text(source.host),
    monitored: bool(source.monitored),
  };
}

function normalizeMetric(value: unknown): MonitorMetric | undefined {
  const source = record(value);
  const server = normalizeServer(source);
  if (!server) return undefined;
  return {
    ...server,
    online: bool(source.online),
    metricsLoading: bool(source.metricsLoading),
    cpu: typeof source.cpu === "number" ? source.cpu : undefined,
    memory: typeof source.memory === "number" ? source.memory : undefined,
    memoryUsed: typeof source.memoryUsed === "number" ? source.memoryUsed : undefined,
    memoryTotal: typeof source.memoryTotal === "number" ? source.memoryTotal : undefined,
    disk: typeof source.disk === "number" ? source.disk : undefined,
    diskUsed: source.diskUsed == null ? undefined : String(source.diskUsed),
    diskTotal: source.diskTotal == null ? undefined : String(source.diskTotal),
    netRx: typeof source.netRx === "number" ? source.netRx : undefined,
    netTx: typeof source.netTx === "number" ? source.netTx : undefined,
    error: source.error == null ? undefined : String(source.error),
  };
}

function subscribe(type: string, handler: (content: unknown) => void): void {
  const subscription = bridge?.on(type, handler);
  if (subscription) subscriptions.push(subscription);
}

function emit(type: string, content?: unknown): void {
  bridge?.emit(type, content);
}

function selectFromServers(): void {
  monitoredKeys.value = servers.value
    .filter((server) => server.monitored)
    .map((server) => server.key);
}

function saveSelection(): void {
  const selected = [...new Set(monitoredKeys.value)];
  emit("saveMonitored", selected);
  setup.value = selected.length === 0;
}

function manage(): void {
  setup.value = true;
  selectFromServers();
}

function cancelSetup(): void {
  setup.value = monitoredKeys.value.length === 0;
}

function openStatus(key: string): void {
  emit("openStatus", key);
}

function openTerminal(key: string): void {
  emit("openTerminal", key);
}

function removeMetric(key: string): void {
  const item = metrics.value.find((metric) => metric.key === key);
  if (!item || !window.confirm(`Remove ${item.name} from SSH monitor?`)) return;
  metrics.value = metrics.value.filter((metric) => metric.key !== key);
  monitoredKeys.value = monitoredKeys.value.filter((itemKey) => itemKey !== key);
  emit("remove", key);
}

const filteredMetrics = computed(() => {
  const query = filter.value.trim().toLowerCase();
  if (!query) return metrics.value;
  return metrics.value.filter((metric) =>
    [metric.name, metric.host, metric.key].some((value) => value.toLowerCase().includes(query)),
  );
});

function metricPercent(value: number | undefined): string {
  return value == null ? "-" : `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

function metricWidth(value: number | undefined): string {
  return `${value == null ? 0 : Math.max(0, Math.min(1, value)) * 100}%`;
}

function metricColor(value: number | undefined): string {
  if ((value ?? 0) >= 0.85) return "var(--vscode-errorForeground, #f14c4c)";
  if ((value ?? 0) >= 0.7) return "var(--vscode-terminal-ansiYellow, #e2c08d)";
  return "var(--vscode-terminal-ansiGreen, #89d185)";
}

function formatBytes(value: number | string | undefined): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  let amount = bytes;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function metricSize(used: number | string | undefined, total: number | string | undefined): string {
  const usedText = formatBytes(used);
  const totalText = formatBytes(total);
  return usedText && totalText ? `${usedText} / ${totalText}` : "";
}

function networkSpeed(metric: MonitorMetric): string {
  if (metric.metricsLoading) return "…";
  if (metric.error) return "-";
  const bytesPerSecond = (metric.netRx ?? 0) + (metric.netTx ?? 0);
  return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`;
}

onMounted(() => {
  subscribe("serverList", (content) => {
    const next = Array.isArray(content)
      ? content.map(normalizeServer).filter((item): item is MonitorServer => Boolean(item))
      : [];
    servers.value = next;
    if (monitoredKeys.value.length === 0) selectFromServers();
  });
  subscribe("monitoredKeys", (content) => {
    monitoredKeys.value = Array.isArray(content)
      ? content.filter((item): item is string => typeof item === "string")
      : [];
    setup.value = monitoredKeys.value.length === 0;
  });
  subscribe("metrics", (content) => {
    metrics.value = Array.isArray(content)
      ? content.map(normalizeMetric).filter((item): item is MonitorMetric => Boolean(item))
      : [];
  });
  subscribe("metricUpdate", (content) => {
    const next = normalizeMetric(content);
    if (!next) return;
    const index = metrics.value.findIndex((metric) => metric.key === next.key);
    if (index < 0) {
      metrics.value = [...metrics.value, next];
      return;
    }
    metrics.value[index] = { ...metrics.value[index], ...next };
  });
  subscribe("removed", (content) => {
    status.value = text(record(content).message || content, "Removed from monitor.");
  });
  subscribe("error", (content) => {
    status.value = text(record(content).message || content, "SSH monitor request failed.");
  });
  bridge?.init("sshMonitor");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <section
    class="route-workspace ssh-monitor-view"
    data-route="sshMonitor"
  >
    <div
      v-if="setup"
      class="ssh-monitor-view__setup"
    >
      <header class="route-workspace__header">
        <div>
          <h1>Select SSH servers</h1>
          <p class="route-workspace__subline">
            Choose the servers whose status should be polled.
          </p>
        </div>
        <VscButton
          type="default"
          @click="emit('load')"
        >
          Refresh servers
        </VscButton>
      </header>

      <div
        v-if="servers.length > 0"
        class="ssh-monitor-view__server-list"
      >
        <label
          v-for="server in servers"
          :key="server.key"
          class="ssh-monitor-view__server-row"
        >
          <input
            v-model="monitoredKeys"
            type="checkbox"
            :value="server.key"
          >
          <span>
            <strong>{{ server.name }}</strong>
            <small>{{ server.host }}</small>
          </span>
        </label>
      </div>
      <p
        v-else
        class="route-workspace__empty"
      >
        No SSH or SFTP server is available.
      </p>

      <div class="route-workspace__actions">
        <VscButton
          type="primary"
          :disabled="monitoredKeys.length === 0"
          @click="saveSelection"
        >
          Start monitor
        </VscButton>
        <VscButton
          v-if="metrics.length > 0 || monitoredKeys.length > 0"
          type="default"
          @click="cancelSetup"
        >
          Cancel
        </VscButton>
      </div>
    </div>

    <div
      v-else
      class="ssh-monitor-view__dashboard"
    >
      <header class="route-workspace__header">
        <div>
          <h1>SSH monitor</h1>
          <p class="route-workspace__subline">
            {{ monitoredKeys.length }} server(s) · {{ status || "Polling every 5 seconds" }}
          </p>
        </div>
        <div class="route-workspace__actions">
          <UiInput
            v-model="filter"
            label=""
            placeholder="Filter servers"
          />
          <VscButton
            type="default"
            @click="emit('refresh')"
          >
            Refresh
          </VscButton>
          <VscButton
            type="default"
            @click="manage"
          >
            Manage
          </VscButton>
        </div>
      </header>

      <div
        v-if="filteredMetrics.length > 0"
        class="result-view__table-wrap"
      >
        <table class="result-view__table ssh-monitor-view__table">
          <thead>
            <tr>
              <th>System</th>
              <th>Host</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>Disk</th>
              <th>Network</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="metric in filteredMetrics"
              :key="metric.key"
              class="ssh-monitor-view__metric-row"
              @click="openStatus(metric.key)"
            >
              <td>
                <span class="ssh-monitor-view__system">
                  <span
                    class="ssh-monitor-view__status-dot"
                    :class="{
                      'ssh-monitor-view__status-dot--online': metric.online,
                      'ssh-monitor-view__status-dot--offline': !metric.online,
                    }"
                  />
                  <strong>{{ metric.name }}</strong>
                </span>
              </td>
              <td>{{ metric.host }}</td>
              <td>
                <div class="ssh-monitor-view__metric-bar">
                  <span v-if="metric.metricsLoading">…</span>
                  <span v-else-if="metric.error">-</span>
                  <template v-else>
                    <span>{{ metricPercent(metric.cpu) }}</span>
                    <span class="ssh-monitor-view__bar-track">
                      <span
                        class="ssh-monitor-view__bar-fill"
                        :style="{ width: metricWidth(metric.cpu), background: metricColor(metric.cpu) }"
                      />
                    </span>
                  </template>
                </div>
              </td>
              <td :title="metricSize(metric.memoryUsed, metric.memoryTotal)">
                <div class="ssh-monitor-view__metric-bar">
                  <span v-if="metric.metricsLoading">…</span>
                  <span v-else-if="metric.error">-</span>
                  <template v-else>
                    <span>{{ metricPercent(metric.memory) }}</span>
                    <span class="ssh-monitor-view__bar-track">
                      <span
                        class="ssh-monitor-view__bar-fill"
                        :style="{ width: metricWidth(metric.memory), background: metricColor(metric.memory) }"
                      />
                    </span>
                  </template>
                </div>
              </td>
              <td :title="metricSize(metric.diskUsed, metric.diskTotal)">
                <div class="ssh-monitor-view__metric-bar">
                  <span v-if="metric.metricsLoading">…</span>
                  <span v-else-if="metric.error">-</span>
                  <template v-else>
                    <span>{{ metricPercent(metric.disk) }}</span>
                    <span class="ssh-monitor-view__bar-track">
                      <span
                        class="ssh-monitor-view__bar-fill"
                        :style="{ width: metricWidth(metric.disk), background: metricColor(metric.disk) }"
                      />
                    </span>
                  </template>
                </div>
              </td>
              <td>{{ networkSpeed(metric) }}</td>
              <td>
                <div class="ssh-monitor-view__row-actions">
                  <VscButton
                    type="default"
                    @click.stop="openTerminal(metric.key)"
                  >
                    Terminal
                  </VscButton>
                  <VscButton
                    type="danger"
                    @click.stop="removeMetric(metric.key)"
                  >
                    Remove
                  </VscButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p
        v-else
        class="route-workspace__empty"
      >
        No monitored server matches the current filter.
      </p>
    </div>
  </section>
</template>
