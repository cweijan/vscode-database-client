<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { parquetMetadata, parquetReadObjects, parquetSchema } from "hyparquet";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import { readViewerThemeClass } from "../viewerTheme";

interface ParquetRow {
  readonly [key: string]: unknown;
}

interface ParquetState {
  data?: unknown;
  fileName?: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const bytes = ref<Uint8Array>();
const rows = ref<ParquetRow[]>([]);
const columns = ref<string[]>([]);
const rowCount = ref<bigint | number>(0);
const status = ref("Loading Parquet file…");
const fileName = ref(String((bootstrap.state as ParquetState).fileName || "Parquet file"));
let openSubscription: BridgeDisposable | undefined;
let stateSubscription: BridgeDisposable | undefined;
let saveSubscription: BridgeDisposable | undefined;
let loadSequence = 0;

const rowCountText = computed(() => rowCount.value.toString());
const viewerThemeClass = readViewerThemeClass();

function stateBytes(value: unknown): Uint8Array | undefined {
  const data = value && typeof value === "object" ? (value as ParquetState).data : undefined;
  if (!Array.isArray(data)) return undefined;
  const values = data.map(Number);
  return Uint8Array.from(values);
}

function cell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "bigint") return value.toString();
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function asyncBuffer(source: Uint8Array) {
  return {
    byteLength: source.byteLength,
    slice(start: number, end?: number): ArrayBuffer {
      return source.slice(start, end).buffer;
    },
  };
}

async function load(value: unknown): Promise<void> {
  const source = stateBytes(value) || bytes.value;
  if (!source) {
    status.value = "No Parquet bytes received.";
    return;
  }
  bytes.value = source;
  const sequence = ++loadSequence;
  status.value = "Reading Parquet schema and rows…";
  try {
    const file = asyncBuffer(source);
    const metadata = parquetMetadata(source.slice().buffer);
    const schema = parquetSchema(metadata);
    const data = await parquetReadObjects({
      file,
      metadata,
      rowFormat: "object",
      rowStart: 0,
      rowEnd: 1_000,
    });
    if (sequence !== loadSequence) return;
    rows.value = data as ParquetRow[];
    columns.value = schema.children.map((item) => item.element.name);
    rowCount.value = metadata.num_rows;
    status.value = `Loaded ${rows.value.length} displayed row(s) from ${rowCountText.value} total row(s).`;
  } catch (error) {
    if (sequence !== loadSequence) return;
    status.value = error instanceof Error ? error.message : String(error);
    rows.value = [];
    columns.value = [];
  }
}

function requestSave(): void {
  const data = bytes.value ? Array.from(bytes.value) : [];
  bridge?.emit("saveContent", { data });
}

onMounted(() => {
  openSubscription = bridge?.on("open", (content) => {
    const value = content as ParquetState;
    if (typeof value.fileName === "string") fileName.value = value.fileName;
    void load(value);
  });
  stateSubscription = bridge?.on("setState", (content) => {
    const value = content as ParquetState;
    if (typeof value.fileName === "string") fileName.value = value.fileName;
    if (stateBytes(value)) void load(value);
  });
  saveSubscription = bridge?.on("requestSave", requestSave);
  bridge?.emit("init");
});

onBeforeUnmount(() => {
  openSubscription?.dispose();
  stateSubscription?.dispose();
  saveSubscription?.dispose();
  loadSequence += 1;
});
</script>

<template>
  <div
    class="data-viewer"
    :class="viewerThemeClass"
  >
    <div class="data-viewer__body">
      <aside class="data-viewer__sider">
        <div class="data-viewer__sider-inner">
          <div class="data-viewer__sider-header">
            <i class="codicon codicon-table" /> Parquet
          </div>
          <div
            v-if="fileName"
            class="data-viewer__sider-title"
          >
            <i class="codicon codicon-database blue" />
            <span>{{ fileName }}</span>
          </div>
          <div
            v-if="columns.length"
            class="data-viewer__meta data-viewer__meta--grid"
          >
            <div class="data-viewer__stat">
              <span class="data-viewer__stat-label"><i class="codicon codicon-symbol-field" /> Columns</span>
              <strong class="data-viewer__stat-value">{{ columns.length }}</strong>
            </div>
            <div class="data-viewer__stat">
              <span class="data-viewer__stat-label"><i class="codicon codicon-database" /> Rows</span>
              <strong class="data-viewer__stat-value">{{ rowCountText }}</strong>
            </div>
          </div>
          <div class="data-viewer__list">
            <div
              v-for="column in columns"
              :key="column"
              class="data-viewer__list-item"
              :title="column"
            >
              <i class="codicon codicon-symbol-field data-viewer__list-icon" />
              <span class="data-viewer__list-name">{{ column }}</span>
            </div>
          </div>
          <div class="data-viewer__sider-bottom">
            <div class="data-viewer__sider-footer">
              <VscButton
                size="small"
                icon="codicon-save"
                class="data-viewer__footer-btn"
                @click="requestSave"
              >
                Save
              </VscButton>
            </div>
          </div>
        </div>
      </aside>
      <main class="data-viewer__main">
        <div class="data-viewer__content-header">
          <i class="codicon codicon-table yellow data-viewer__list-icon" />
          <span class="data-viewer__content-title">{{ fileName }}</span>
          <span class="data-viewer__content-meta">{{ status }}</span>
        </div>
        <div
          v-if="rows.length > 0"
          class="data-viewer__table-wrap"
        >
          <table>
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
                  <input
                    class="data-viewer__cell-input"
                    :value="cell(row[column])"
                    readonly
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-else
          class="data-viewer__empty"
        >
          {{ status }}
        </div>
      </main>
    </div>
  </div>
</template>
