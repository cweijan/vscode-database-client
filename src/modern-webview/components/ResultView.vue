<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";

interface ResultPayload {
  title?: string;
  sql?: string;
  rows?: Record<string, unknown>[];
  fields?: Array<Record<string, unknown>>;
  affectedRows?: number;
  dirty?: boolean;
  readonly?: boolean;
  readOnly?: boolean;
  table?: string;
  schema?: string | null;
  database?: string | null;
  error?: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const payload = reactive<ResultPayload>({
  ...(bootstrap.state as ResultPayload),
});
let resultSubscription: BridgeDisposable | undefined;
let stateSubscription: BridgeDisposable | undefined;
let updateSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;
let hostErrorSubscription: BridgeDisposable | undefined;
let clearSaveSubscription: BridgeDisposable | undefined;
const status = ref("");
const updateSql = ref("");
const editing = ref<{ rowIndex: number; column: string }>();
const draft = ref("");

const rows = computed(() => payload.rows ?? []);
const columns = computed(() => {
  const fieldNames = (payload.fields ?? [])
    .map((field) => String(field.name ?? field.columnName ?? ""))
    .filter(Boolean);
  return fieldNames.length > 0
    ? fieldNames
    : Object.keys(rows.value[0] ?? {});
});

function applyResult(content: unknown): void {
  if (!content || typeof content !== "object") {
    return;
  }
  Object.assign(payload, content as ResultPayload);
}

function cell(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  return value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
}

const readonly = computed(() => payload.readonly === true || payload.readOnly === true);
const canOpenErDiagram = computed(() => Boolean(payload.table));

function startEdit(rowIndex: number, column: string): void {
  if (readonly.value) return;
  editing.value = { rowIndex, column };
  draft.value = cell(rows.value[rowIndex] ?? {}, column);
}

function cancelEdit(): void {
  editing.value = undefined;
  draft.value = "";
}

function saveCell(): void {
  const current = editing.value;
  if (!current) return;
  bridge?.emit("syncRow", {
    index: current.rowIndex,
    field: current.column,
    value: draft.value,
  });
  payload.dirty = true;
  cancelEdit();
}

function copyRows(): void {
  bridge?.emit("copyResult", { columns: columns.value, rows: rows.value });
}

function exportRows(): void {
  bridge?.emit("exportResult", { columns: columns.value, rows: rows.value });
}

function exportCell(row: Record<string, unknown>, column: string): void {
  bridge?.emit("exportFile", {
    column: { name: column },
    content: row[column],
  });
}

function saveChanges(): void {
  const sql = updateSql.value.trim();
  if (!sql) {
    status.value = "Enter one update statement before saving.";
    return;
  }
  bridge?.emit("saveModify", { sql });
}

function messageText(content: unknown, fallback: string): string {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const message = (content as Record<string, unknown>).message;
    if (message != null) return String(message);
  }
  return content == null ? fallback : String(content);
}

onMounted(() => {
  resultSubscription = bridge?.on("result", applyResult);
  stateSubscription = bridge?.on("setState", applyResult);
  updateSubscription = bridge?.on("updateSuccess", (content) => {
    payload.dirty = false;
    status.value = messageText(content, "Update completed.");
  });
  errorSubscription = bridge?.on("ERROR", (content) => {
    status.value = messageText(content, "Update failed.");
  });
  hostErrorSubscription = bridge?.on("error", (content) => {
    status.value = messageText(content, "Result request failed.");
  });
  clearSaveSubscription = bridge?.on("clearSaveState", () => {
    payload.dirty = false;
  });
  bridge?.emit("route-result");
});

onBeforeUnmount(() => {
  resultSubscription?.dispose();
  stateSubscription?.dispose();
  updateSubscription?.dispose();
  errorSubscription?.dispose();
  hostErrorSubscription?.dispose();
  clearSaveSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace result-view"
    data-route="result"
  >
    <header class="route-workspace__header">
      <div>
        <h1>{{ payload.title || "Query Result" }}</h1>
        <p
          v-if="payload.sql"
          class="route-workspace__subline"
        >
          {{ payload.sql }}
        </p>
      </div>
      <div class="route-workspace__actions">
        <UiButton
          type="button"
          @click="copyRows"
        >
          Copy
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="exportRows"
        >
          Export
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="bridge?.emit('viewJSON')"
        >
          JSON
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="bridge?.emit('editInVSCode', payload.sql || '')"
        >
          Edit SQL
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="bridge?.emit('viewHistory')"
        >
          History
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          :disabled="!canOpenErDiagram"
          @click="bridge?.emit('openErDiagram')"
        >
          ER Diagram
        </UiButton>
      </div>
    </header>

    <p
      v-if="payload.error"
      class="route-workspace__error"
    >
      {{ payload.error }}
    </p>
    <p
      v-if="status"
      class="route-workspace__status"
    >
      {{ status }}
    </p>
    <label class="vsc-field vsc-field--wide">
      <span class="vsc-field__label">
        Update SQL (optional; used by Save changes)
      </span>
      <textarea
        v-model="updateSql"
        class="console-view__editor"
        :disabled="readonly"
        placeholder="UPDATE table_name SET column_name = value WHERE id = ..."
      />
    </label>
    <div class="route-workspace__actions">
      <UiButton
        type="button"
        :disabled="readonly || !payload.dirty"
        @click="saveChanges"
      >
        Save changes
      </UiButton>
      <span class="route-workspace__subline">
        {{ payload.dirty ? "Unsaved row edits" : "No unsaved row edits" }}
      </span>
    </div>
    <p
      v-if="!payload.error && rows.length === 0"
      class="route-workspace__empty"
    >
      No rows returned{{ payload.affectedRows == null ? "" : `; affected ${payload.affectedRows} row(s)` }}.
    </p>
    <div
      v-else-if="!payload.error"
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
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in rows"
            :key="rowIndex"
          >
            <td
              v-for="column in columns"
              :key="column"
              title="Double-click to edit"
              @dblclick="startEdit(rowIndex, column)"
            >
              <template v-if="editing?.rowIndex === rowIndex && editing.column === column">
                <input
                  v-model="draft"
                  class="vsc-input"
                  @keyup.enter="saveCell"
                  @keyup.esc="cancelEdit"
                >
              </template>
              <template v-else>
                {{ cell(row, column) }}
              </template>
            </td>
            <td>
              <UiButton
                type="button"
                variant="default"
                :disabled="readonly"
                @click="startEdit(rowIndex, columns[0] || '')"
              >
                Edit first cell
              </UiButton>
              <UiButton
                type="button"
                variant="default"
                @click="exportCell(row, columns[0] || '')"
              >
                Export first cell
              </UiButton>
              <UiButton
                v-if="editing?.rowIndex === rowIndex"
                type="button"
                @click="saveCell"
              >
                Apply
              </UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
