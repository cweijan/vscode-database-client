<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "vue-chartjs";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import DumpView from "./DumpView.vue";
import StructureDiffView from "./StructureDiffView.vue";
import XtermView from "./XtermView.vue";

ChartJS.register(CategoryScale, Legend, LineElement, LinearScale, PointElement, Tooltip);

interface TableField {
  readonly name: string;
  readonly [key: string]: unknown;
}

interface DataTable {
  fields: TableField[];
  rows: Array<Record<string, unknown>>;
  supportKill?: boolean;
}

interface ManagerCapabilities {
  log: boolean;
  dashBoard: boolean;
  processList: boolean;
  hasAnyMonitor: boolean;
  dump: boolean;
  structDiff: boolean;
}

interface DashboardPoint {
  now: string;
  type: string;
  value: number;
}

interface Dashboard {
  queries: DashboardPoint[];
  traffic: DashboardPoint[];
  variables: DataTable;
}

type ManagerTab = "log" | "dashBoard" | "processList" | "dump" | "structDiff";

interface ManagerTabItem {
  readonly id: ManagerTab;
  readonly label: string;
  readonly icon: string;
}

const CHART_HISTORY_LIMIT = 60;
const CHART_COLOR_VARS = [
  "--vscode-charts-green",
  "--vscode-charts-blue",
  "--vscode-charts-yellow",
  "--vscode-charts-purple",
  "--vscode-charts-red",
] as const;

class DashboardChartHistory {
  private labels: string[] = [];
  private readonly series = new Map<string, { data: number[]; previousOrigin: number }>();

  public addData(points: readonly DashboardPoint[]): void {
    if (points.length === 0) return;
    this.labels = this.limit([...this.labels, points[0].now]);
    for (const point of points) {
      const current = this.series.get(point.type);
      if (!current) {
        this.series.set(point.type, { data: [0], previousOrigin: point.value });
        continue;
      }
      const value = Number(((point.value - current.previousOrigin) / 1024).toFixed(2));
      current.previousOrigin = point.value;
      current.data = this.limit([...current.data, value]);
    }
  }

  public clear(): void {
    this.labels = [];
    this.series.clear();
  }

  public toChartData(colors: readonly string[]): ChartData<"line", number[], string> {
    return {
      labels: this.labels,
      datasets: [...this.series.entries()].map(([label, series], index) => ({
        label,
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length],
        data: series.data,
      })),
    };
  }

  private limit(values: string[]): string[];
  private limit(values: number[]): number[];
  private limit<T>(values: T[]): T[] {
    return values.length > CHART_HISTORY_LIMIT
      ? values.slice(values.length - CHART_HISTORY_LIMIT)
      : values;
  }
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const tab = ref<ManagerTab>("processList");
const dbType = ref("");
const status = ref("");
const loading = ref(false);
const info = reactive<Record<string, unknown>>({});
const capabilities = reactive<ManagerCapabilities>({
  log: true,
  dashBoard: false,
  processList: false,
  hasAnyMonitor: false,
  dump: false,
  structDiff: false,
});
const process = reactive<DataTable>({ fields: [], rows: [], supportKill: false });
const dashboard = reactive<Dashboard>({
  queries: [],
  traffic: [],
  variables: { fields: [], rows: [] },
});
const trafficHistory = new DashboardChartHistory();
const queryHistory = new DashboardChartHistory();
const chartRevision = ref(0);
let subscriptions: BridgeDisposable[] = [];
let dashboardTimer: ReturnType<typeof setInterval> | undefined;
let focusHandler: (() => void) | undefined;

const tabItems = computed<ManagerTabItem[]>(() => {
  const items: ManagerTabItem[] = [
    { id: "log", label: "Log", icon: "codicon-output yellow" },
  ];
  if (capabilities.dashBoard) {
    items.push({ id: "dashBoard", label: "Dashboard", icon: "codicon-pulse green" });
  }
  if (capabilities.processList) {
    items.push({ id: "processList", label: "ProcessList", icon: "codicon-list-tree blue" });
  }
  if (capabilities.dump) {
    items.push({ id: "dump", label: "Dump", icon: "codicon-database orange" });
  }
  if (capabilities.structDiff) {
    items.push({ id: "structDiff", label: "Structure Diff", icon: "codicon-git-compare" });
  }
  return items;
});

const serverFields = computed(() => isPostgresType(dbType.value)
  ? [
    { name: "Port", key: "port" },
    { name: "Version", key: "server_version" },
    { name: "Slow Query Log", key: "log_min_duration_statement" },
    { name: "Activity Tracking", key: "track_activities" },
    { name: "Config File", key: "config_file" },
    { name: "Data Directory", key: "data_directory" },
  ]
  : [
    { name: "Port", key: "report_port" },
    { name: "Version", key: "version" },
    { name: "Slow Query Log", key: "slow_query_log" },
    { name: "Performance Schema", key: "performance_schema" },
    { name: "Base Directory", key: "basedir" },
    { name: "Data Directory", key: "datadir" },
  ]);

const chartColors = computed(() => CHART_COLOR_VARS.map((name, index) => {
  const fallback = ["#89d185", "#3794ff", "#cca700", "#b180d7", "#f14c4c"][index];
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}));

const trafficChartData = computed<ChartData<"line", number[], string>>(() => {
  chartRevision.value;
  return trafficHistory.toChartData(chartColors.value);
});

const queryChartData = computed<ChartData<"line", number[], string>>(() => {
  chartRevision.value;
  return queryHistory.toChartData(chartColors.value);
});

const trafficChartOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  elements: { point: { radius: 0 } },
  scales: {
    y: {
      min: 0,
      ticks: { callback: (value) => `${value}KB` },
    },
  },
};

const queryChartOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  elements: { point: { radius: 0 } },
  scales: {
    y: {
      min: 0,
    },
  },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isPostgresType(value: string): boolean {
  return [
    "PostgreSQL",
    "Redshift",
    "Kingbase",
    "GaussDB",
    "Cockroach",
    "PostgreCompatible",
  ].includes(value);
}

function asTable(value: unknown): DataTable {
  const source = record(value);
  const fields = Array.isArray(source.fields)
    ? source.fields
      .map((field) => record(field))
      .map((field) => ({ ...field, name: String(field.name || field.columnName || "") }))
      .filter((field) => field.name)
    : [];
  const rows = Array.isArray(source.rows)
    ? source.rows.map(record)
    : [];
  return {
    fields,
    rows,
    supportKill: Boolean(source.supportKill),
  };
}

function asPoints(value: unknown): DashboardPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const point = record(item);
    return {
      now: String(point.now || ""),
      type: String(point.type || ""),
      value: Number(point.value) || 0,
    };
  });
}

function applyInfo(content: unknown): void {
  const value = record(content);
  Object.keys(info).forEach((key) => delete info[key]);
  Object.assign(info, value);
  if (value.dbType) dbType.value = String(value.dbType);
  applyCapabilities(value.monitorStatus);
  if (tab.value === "processList") loadProcesses();
  if (tab.value === "dashBoard") loadDashboard();
}

function applyCapabilities(content: unknown): void {
  const value = record(content);
  for (const key of Object.keys(capabilities) as Array<keyof ManagerCapabilities>) {
    if (value[key] !== undefined) capabilities[key] = Boolean(value[key]);
  }
  if (!tabItems.value.some((item) => item.id === tab.value)) {
    tab.value = "log";
  }
}

function applyDashboard(content: unknown): void {
  const value = record(content);
  dashboard.queries = asPoints(value.queries);
  dashboard.traffic = asPoints(value.traffic);
  dashboard.variables = asTable(value.variables);
  queryHistory.addData(dashboard.queries);
  trafficHistory.addData(dashboard.traffic);
  chartRevision.value += 1;
  loading.value = false;
}

function clearDashboardHistory(): void {
  queryHistory.clear();
  trafficHistory.clear();
  chartRevision.value += 1;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}

function rowKey(row: Record<string, unknown>, index: number): string {
  const key = row.ID ?? row.Id ?? row.id ?? row.pid ?? row.Process ?? row["Process Id"];
  return `${cellText(key) || "row"}-${index}`;
}

function variableValue(key: string): string {
  const row = dashboard.variables.rows.find((candidate) =>
    ["Variable_name", "name", "Name"].some((field) =>
      String(candidate[field] ?? "").toLowerCase() === key.toLowerCase(),
    ),
  );
  if (!row) return "-";
  const value = row.Value ?? row.value ?? row.setting;
  return cellText(value) || "-";
}

function isPathField(key: string): boolean {
  return isPostgresType(dbType.value)
    ? key === "config_file" || key === "data_directory"
    : key === "basedir" || key === "datadir";
}

function isStatusField(key: string): boolean {
  return isPostgresType(dbType.value)
    ? key === "track_activities" || key === "log_min_duration_statement"
    : key === "slow_query_log" || key === "performance_schema";
}

function isStatusOn(key: string): boolean {
  const value = variableValue(key);
  if (key === "log_min_duration_statement") return value !== "-" && value !== "-1";
  return ["ON", "1", "YES", "TRUE"].includes(value.toUpperCase());
}

function statusText(key: string): string {
  if (key === "log_min_duration_statement" && isStatusOn(key)) {
    return `${variableValue(key)}ms`;
  }
  return isStatusOn(key) ? "ON" : "OFF";
}

function emitTab(next: ManagerTab): void {
  if (!tabItems.value.some((item) => item.id === next)) return;
  const changed = tab.value !== next;
  tab.value = next;
  status.value = "";
  if (next === "processList") loadProcesses();
  if (next === "dashBoard" && changed) {
    clearDashboardHistory();
  }
  if (next === "dashBoard") loadDashboard();
}

function loadProcesses(): void {
  if (!capabilities.processList) return;
  loading.value = true;
  bridge?.emit("processList");
}

function loadDashboard(): void {
  if (!capabilities.dashBoard) return;
  loading.value = true;
  bridge?.emit("dashBoard");
}

function killProcess(row: Record<string, unknown>): void {
  if (!process.supportKill) return;
  loading.value = true;
  bridge?.emit("killProcess", row);
}

onMounted(() => {
  subscriptions = [
    bridge?.on("info", applyInfo),
    bridge?.on("dbType", (content) => { dbType.value = String(content || ""); }),
    bridge?.on("monitorStatus", applyCapabilities),
    bridge?.on("processList", (content) => {
      Object.assign(process, asTable(content));
      loading.value = false;
    }),
    bridge?.on("dashBoard", applyDashboard),
    bridge?.on("error", (content) => {
      status.value = cellText(record(content).message || content) || "Manager request failed.";
      loading.value = false;
    }),
    bridge?.on("open_dump", () => {
      status.value = "";
      if (capabilities.dump) tab.value = "dump";
    }),
  ].filter((item): item is BridgeDisposable => Boolean(item));
  bridge?.init("manager");
  focusHandler = () => bridge?.init("manager");
  window.addEventListener("focus", focusHandler);
  dashboardTimer = setInterval(() => {
    if (tab.value === "dashBoard") loadDashboard();
  }, 3000);
});

onBeforeUnmount(() => {
  if (focusHandler) window.removeEventListener("focus", focusHandler);
  if (dashboardTimer) clearInterval(dashboardTimer);
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <section
    class="db-manager manager-view"
    data-route="manager"
  >
    <aside class="db-manager__sidebar">
      <button
        v-for="item in tabItems"
        :key="item.id"
        class="db-manager__item"
        :class="{ 'db-manager__item--active': item.id === tab }"
        type="button"
        @click="emitTab(item.id)"
      >
        <i
          class="db-manager__icon"
          :class="item.icon"
          aria-hidden="true"
        />
        <span>{{ item.label }}</span>
      </button>
    </aside>

    <main class="db-manager__main">
      <p
        v-if="status"
        class="db-manager__status"
        role="alert"
      >
        {{ status }}
      </p>

      <div
        v-if="tab === 'log'"
        class="db-manager__log-panel"
      >
        <XtermView :embedded="true" />
      </div>

      <div
        v-if="tab === 'structDiff' && capabilities.structDiff"
        class="db-manager__struct-diff-panel"
      >
        <StructureDiffView :embedded="true" />
      </div>

      <div
        v-if="tab === 'dump' && capabilities.dump"
        class="db-manager__dump-panel"
      >
        <DumpView :db-type="dbType" />
      </div>

      <div
        v-if="tab === 'dashBoard' && capabilities.dashBoard"
        class="db-manager__dashboard-panel"
      >
        <section class="dashboard">
          <div class="dashboard__top">
            <section class="dashboard__server-info">
              <div class="dashboard__server-head">
                <i
                  class="codicon codicon-server dashboard__server-icon"
                  aria-hidden="true"
                />
                <span class="dashboard__server-title">Server Info</span>
              </div>
              <div class="dashboard__server-list">
                <div
                  v-for="field in serverFields"
                  :key="field.key"
                  class="dashboard__server-row"
                >
                  <span class="dashboard__server-label">{{ field.name }}</span>
                  <span
                    class="dashboard__server-value"
                    :class="{ 'dashboard__server-value--path': isPathField(field.key) }"
                    :title="variableValue(field.key)"
                  >
                    <span
                      v-if="isStatusField(field.key)"
                      class="dashboard__badge"
                      :class="isStatusOn(field.key) ? 'dashboard__badge--on' : 'dashboard__badge--off'"
                    >
                      {{ statusText(field.key) }}
                    </span>
                    <template v-else>{{ variableValue(field.key) }}</template>
                  </span>
                </div>
              </div>
            </section>

            <section class="dashboard__chart-card">
              <div class="dashboard__chart-head">
                <i
                  class="codicon codicon-pulse dashboard__chart-icon green"
                  aria-hidden="true"
                />
                <span>Traffic</span>
              </div>
              <div class="dashboard__chart-body">
                <Line
                  :data="trafficChartData"
                  :options="trafficChartOptions"
                />
              </div>
            </section>
          </div>

          <section class="dashboard__chart-card dashboard__chart-card--full">
            <div class="dashboard__chart-head">
              <i
                class="codicon codicon-graph-line dashboard__chart-icon blue"
                aria-hidden="true"
              />
              <span>Queries</span>
            </div>
            <div class="dashboard__chart-body dashboard__chart-body--tall">
              <Line
                :data="queryChartData"
                :options="queryChartOptions"
              />
            </div>
          </section>
        </section>
      </div>

      <div
        v-show="tab === 'processList' && capabilities.processList"
        class="db-manager__panel manager-process-list"
      >
        <div class="manager-process-list__toolbar">
          <button
            class="manager-process-list__refresh"
            type="button"
            title="Refresh"
            :disabled="loading"
            @click="loadProcesses"
          >
            <i
              class="codicon codicon-refresh"
              aria-hidden="true"
            />
          </button>
        </div>
        <div class="manager-process-list__table-wrap">
          <table class="manager-process-list__table">
            <thead>
              <tr>
                <th
                  v-for="field in process.fields"
                  :key="field.name"
                >
                  {{ field.name }}
                </th>
                <th v-if="process.supportKill">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in process.rows"
                :key="rowKey(row, index)"
              >
                <td
                  v-for="field in process.fields"
                  :key="field.name"
                  :title="cellText(row[field.name])"
                >
                  {{ cellText(row[field.name]) || "-" }}
                </td>
                <td v-if="process.supportKill">
                  <button
                    class="manager-process-list__kill"
                    type="button"
                    title="Kill"
                    :disabled="loading"
                    @click="killProcess(row)"
                  >
                    <i
                      class="codicon codicon-debug-stop"
                      aria-hidden="true"
                    />
                  </button>
                </td>
              </tr>
              <tr v-if="!process.rows.length">
                <td
                  :colspan="process.fields.length + (process.supportKill ? 1 : 0) || 1"
                  class="manager-process-list__empty"
                >
                  No process rows returned.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </section>
</template>
