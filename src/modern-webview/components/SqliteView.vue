<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import initSqlJs, { type SqlJsDatabase } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import {
  listSqliteTables,
  readSqlitePage,
  type SqliteFilePage,
  type SqliteFileTable,
} from "../../modern/database/sqliteFile";
import { resultValueText } from "../../modern/database/resultValues";

interface SqliteOpenPayload {
  readonly data?: unknown;
  readonly path?: string;
  readonly fileName?: string;
}

const pageSize = 50;
const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const initial = bootstrap.state as SqliteOpenPayload;
const database = shallowRef<SqlJsDatabase>();
const fileName = ref(initial.fileName || "database.sqlite");
const tables = ref<SqliteFileTable[]>([]);
const selectedTable = ref<string>();
const page = ref<SqliteFilePage>();
const pageNum = ref(1);
const loading = ref(true);
const error = ref("");
let openSubscription: BridgeDisposable | undefined;
let stateSubscription: BridgeDisposable | undefined;
let loadSequence = 0;

const selectedMetadata = computed(() =>
  tables.value.find((table) => table.name === selectedTable.value),
);
const pageCount = computed(() => Math.max(
  1,
  Math.ceil((page.value?.total || selectedMetadata.value?.rowCount || 0) / pageSize),
));

function stateBytes(value: unknown): Uint8Array | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = (value as SqliteOpenPayload).data;
  if (!Array.isArray(data)) return undefined;
  const bytes = data.map(Number);
  return bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ? Uint8Array.from(bytes)
    : undefined;
}

function displayValue(value: unknown): string {
  return resultValueText(value, "NULL");
}

function disposeDatabase(): void {
  database.value?.close();
  database.value = undefined;
}

function selectTable(name: string, nextPage = 1): void {
  if (!database.value) return;
  selectedTable.value = name;
  pageNum.value = Math.min(Math.max(1, nextPage), pageCount.value || 1);
  page.value = readSqlitePage(database.value, name, pageNum.value, pageSize);
}

function changePage(delta: number): void {
  if (!selectedTable.value) return;
  const nextPage = Math.min(pageCount.value, Math.max(1, pageNum.value + delta));
  if (nextPage !== pageNum.value) selectTable(selectedTable.value, nextPage);
}

async function load(value: unknown): Promise<void> {
  const payload = value && typeof value === "object"
    ? value as SqliteOpenPayload
    : {};
  const source = stateBytes(payload);
  const sequence = ++loadSequence;
  loading.value = true;
  error.value = "";
  selectedTable.value = undefined;
  tables.value = [];
  page.value = undefined;
  pageNum.value = 1;
  disposeDatabase();
  try {
    let bytes: Uint8Array;
    if (source) {
      bytes = source;
    } else if (typeof payload.path === "string" && payload.path.trim()) {
      const response = await fetch(payload.path);
      if (!response.ok) throw new Error(`Failed to load SQLite file (${response.status})`);
      bytes = new Uint8Array(await response.arrayBuffer());
    } else {
      throw new Error("No SQLite file bytes received");
    }
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
    if (sequence !== loadSequence) return;
    const nextDatabase = new SQL.Database(bytes);
    database.value = nextDatabase;
    fileName.value = payload.fileName || fileName.value;
    tables.value = listSqliteTables(nextDatabase);
    const first = tables.value[0];
    if (first) selectTable(first.name);
  } catch (reason) {
    if (sequence === loadSequence) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

onMounted(() => {
  openSubscription = bridge?.on("open", (content) => {
    void load(content);
  });
  stateSubscription = bridge?.on("setState", (content) => {
    if (stateBytes(content)) void load(content);
  });
  bridge?.emit("init");
});

onBeforeUnmount(() => {
  loadSequence += 1;
  openSubscription?.dispose();
  stateSubscription?.dispose();
  disposeDatabase();
});
</script>

<template>
  <section
    class="route-workspace sqlite-view"
    data-route="sqlite"
  >
    <header class="route-workspace__header">
      <div>
        <h1>{{ fileName }}</h1>
        <p class="route-workspace__subline">
          SQLite tables and views · {{ tables.length }} object(s)
        </p>
      </div>
      <VscButton
        type="default"
        @click="bridge?.emit('reveal')"
      >
        Reveal file
      </VscButton>
    </header>
    <p
      v-if="loading"
      class="route-workspace__status"
    >
      Loading SQLite database…
    </p>
    <p
      v-else-if="error"
      class="route-workspace__status route-workspace__status--error"
    >
      {{ error }}
    </p>
    <div
      v-else
      class="sqlite-view__body"
    >
      <aside class="sqlite-view__sidebar">
        <strong>Tables</strong>
        <button
          v-for="table in tables"
          :key="table.name"
          type="button"
          class="sqlite-view__table-button"
          :class="{ 'sqlite-view__table-button--active': table.name === selectedTable }"
          @click="selectTable(table.name)"
        >
          <span>{{ table.name }}</span>
          <small>{{ table.type }} · {{ table.rowCount }}</small>
        </button>
        <p
          v-if="tables.length === 0"
          class="route-workspace__empty"
        >
          No user tables or views found.
        </p>
      </aside>
      <div class="sqlite-view__content">
        <template v-if="page && selectedTable">
          <div class="sqlite-view__content-header">
            <div>
              <h2>{{ selectedTable }}</h2>
              <span class="route-workspace__subline">
                {{ selectedMetadata?.type }} · {{ page.total }} row(s)
              </span>
            </div>
            <div class="route-workspace__actions">
              <VscButton
                type="default"
                :disabled="pageNum <= 1"
                @click="changePage(-1)"
              >
                Previous
              </VscButton>
              <span>Page {{ pageNum }} / {{ pageCount }}</span>
              <VscButton
                type="default"
                :disabled="pageNum >= pageCount"
                @click="changePage(1)"
              >
                Next
              </VscButton>
            </div>
          </div>
          <div
            v-if="page.rows.length > 0"
            class="result-view__table-wrap"
          >
            <table class="result-view__table">
              <thead>
                <tr>
                  <th
                    v-for="column in page.columns"
                    :key="column"
                  >
                    {{ column }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, rowIndex) in page.rows"
                  :key="`${pageNum}-${rowIndex}`"
                >
                  <td
                    v-for="column in page.columns"
                    :key="column"
                  >
                    {{ displayValue(row[column]) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p
            v-else
            class="route-workspace__empty"
          >
            No rows returned.
          </p>
        </template>
        <p
          v-else-if="tables.length > 0"
          class="route-workspace__empty"
        >
          Select a table or view.
        </p>
      </div>
    </div>
  </section>
</template>
