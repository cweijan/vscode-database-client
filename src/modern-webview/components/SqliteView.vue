<script setup lang="ts">
import { ElDialog } from "element-plus";
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
import DatabaseFilePanel from "./DatabaseFilePanel.vue";
import ConnectResult from "./target/ConnectResult.vue";
import { readViewerThemeClass } from "../viewerTheme";

interface SqliteOpenPayload {
  readonly data?: unknown;
  readonly path?: string;
  readonly fileName?: string;
}

const pageSize = 50;
const connectVisible = ref(false);
const viewerThemeClass = readViewerThemeClass();
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
  <div
    class="data-viewer"
    :class="viewerThemeClass"
  >
    <div
      v-if="loading"
      class="data-viewer__overlay"
    >
      <i class="codicon codicon-loading codicon-modifier-spin" />
      <span>Loading SQLite database...</span>
    </div>
    <div class="data-viewer__body">
      <aside class="data-viewer__sider">
        <div class="data-viewer__sider-inner">
          <div class="data-viewer__sider-header">
            <i class="codicon codicon-table" /> Tables
          </div>
          <div
            v-if="fileName"
            class="data-viewer__sider-title"
          >
            <i class="codicon codicon-database blue" />
            <span>{{ fileName }}</span>
          </div>
          <div
            v-if="tables.length"
            class="data-viewer__meta data-viewer__meta--grid"
          >
            <div class="data-viewer__stat">
              <span class="data-viewer__stat-label"><i class="codicon codicon-table" /> Tables</span>
              <strong class="data-viewer__stat-value">{{ tables.length }}</strong>
            </div>
            <div class="data-viewer__stat">
              <span class="data-viewer__stat-label"><i class="codicon codicon-database" /> Rows</span>
              <strong class="data-viewer__stat-value">{{ (page?.total ?? 0).toLocaleString() }}</strong>
            </div>
          </div>
          <div class="data-viewer__list">
            <div
              v-for="table in tables"
              :key="table.name"
              class="data-viewer__list-item data-viewer__list-item--clickable"
              :class="{ 'is-active': table.name === selectedTable }"
              :title="table.name"
              @click="selectTable(table.name)"
            >
              <i
                class="codicon data-viewer__list-icon"
                :class="table.type === 'view' ? 'codicon-eye' : 'codicon-table yellow'"
              />
              <span class="data-viewer__list-name">{{ table.name }}</span>
              <span class="data-viewer__list-meta">{{ table.type === "view" ? "view" : table.rowCount }}</span>
            </div>
          </div>
          <div class="data-viewer__sider-bottom">
            <div class="data-viewer__sider-footer">
              <VscButton
                size="small"
                icon="codicon-database"
                class="data-viewer__footer-btn"
                @click="bridge?.emit('reveal')"
              >
                Show in tree
              </VscButton>
              <VscButton
                size="small"
                icon="codicon-plug"
                class="data-viewer__footer-btn"
                @click="connectVisible = true"
              >
                Add connection
              </VscButton>
            </div>
            <ConnectResult />
          </div>
        </div>
      </aside>
      <main class="data-viewer__main">
        <div
          v-if="error"
          class="data-viewer__empty"
        >
          <div class="data-viewer__error">
            <i class="codicon codicon-error" />
            <span>{{ error }}</span>
          </div>
        </div>
        <template v-else-if="page && selectedTable">
          <div class="data-viewer__content-header">
            <i
              class="codicon data-viewer__list-icon"
              :class="selectedMetadata?.type === 'view' ? 'codicon-eye' : 'codicon-table yellow'"
            />
            <span class="data-viewer__content-title">{{ selectedTable }}</span>
            <span class="data-viewer__content-meta">{{ selectedMetadata?.type }} · {{ page.total }} row(s)</span>
          </div>
          <div
            v-if="page.rows.length > 0"
            class="data-viewer__table-wrap"
          >
            <table>
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
          <div
            v-else
            class="data-viewer__empty"
          >
            No rows returned.
          </div>
          <div class="data-viewer__footer">
            <span class="data-viewer__footer-total">{{ page.total }} row(s)</span>
            <div class="data-viewer__pager">
              <VscButton
                size="micro"
                type="secondary"
                icon="codicon-chevron-left"
                :disabled="pageNum <= 1"
                @click="changePage(-1)"
              />
              <span class="data-viewer__pager-info">{{ pageNum }} / {{ pageCount }}</span>
              <VscButton
                size="micro"
                type="secondary"
                icon="codicon-chevron-right"
                :disabled="pageNum >= pageCount"
                @click="changePage(1)"
              />
            </div>
          </div>
        </template>
        <div
          v-else
          class="data-viewer__empty"
        >
          {{ tables.length ? "Select a table or view." : "No user tables or views found." }}
        </div>
      </main>
    </div>
    <ElDialog
      v-model="connectVisible"
      title="Add SQLite connection"
      width="480px"
      class="sqlite-connect-dialog"
      close-on-click-modal
      destroy-on-close
    >
      <DatabaseFilePanel
        embedded
        :db-path="fileName"
        :file-name="fileName"
        :has-dependency="true"
      />
    </ElDialog>
  </div>
</template>
