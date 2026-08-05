<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";

interface ResultPayload {
  sql?: string;
  rows?: Record<string, unknown>[];
  fields?: Array<Record<string, unknown>>;
  affectedRows?: number;
  error?: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const payload = reactive<ResultPayload>({
  ...(bootstrap.state as ResultPayload),
});
let resultSubscription: BridgeDisposable | undefined;
let stateSubscription: BridgeDisposable | undefined;

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

function copyRows(): void {
  bridge?.emit("copyResult", { columns: columns.value, rows: rows.value });
}

function exportRows(): void {
  bridge?.emit("exportResult", { columns: columns.value, rows: rows.value });
}

onMounted(() => {
  resultSubscription = bridge?.on("result", applyResult);
  stateSubscription = bridge?.on("setState", applyResult);
  bridge?.emit("route-result");
});

onBeforeUnmount(() => {
  resultSubscription?.dispose();
  stateSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace result-view"
    data-route="result"
  >
    <header class="route-workspace__header">
      <div>
        <h1>Query Result</h1>
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
      </div>
    </header>

    <p
      v-if="payload.error"
      class="route-workspace__error"
    >
      {{ payload.error }}
    </p>
    <p
      v-else-if="rows.length === 0"
      class="route-workspace__empty"
    >
      No rows returned{{ payload.affectedRows == null ? "" : `; affected ${payload.affectedRows} row(s)` }}.
    </p>
    <div
      v-else
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
            v-for="(row, rowIndex) in rows"
            :key="rowIndex"
          >
            <td
              v-for="column in columns"
              :key="column"
            >
              {{ cell(row, column) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
