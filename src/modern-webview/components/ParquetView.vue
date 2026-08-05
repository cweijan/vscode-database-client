<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { parquetMetadata, parquetReadObjects, parquetSchema } from "hyparquet";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";

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
  <section
    class="route-workspace parquet-view"
    data-route="parquet"
  >
    <header class="route-workspace__header">
      <div>
        <h1>{{ fileName }}</h1>
        <p class="route-workspace__subline">
          Parquet schema and first 1,000 rows
        </p>
      </div>
      <UiButton
        type="button"
        @click="requestSave"
      >
        Save
      </UiButton>
    </header>
    <p class="route-workspace__status">
      {{ status }}
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
