<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";

import {
  normalizeMockModel,
  type MockModel,
} from "../../modern/database/mockModel";
import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiInput from "./UiInput.vue";

interface MockRow {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly isIndex: boolean;
  enabled: boolean;
  value: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const table = ref("");
const mockCount = ref("10");
const startMode = ref<"auto" | "manual">("auto");
const startIndex = ref("1");
const mockValueReference = ref("http://mockjs.com/examples.html#DPD");
const rows = ref<MockRow[]>([]);
const loading = ref(true);
const generating = ref(false);
const status = ref("");
const statusKind = ref<"normal" | "error" | "success">("normal");
let modelSubscription: BridgeDisposable | undefined;
let doneSubscription: BridgeDisposable | undefined;
let refreshSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function applyModel(content: unknown): void {
  const model = normalizeMockModel(content);
  if (!model) {
    loading.value = false;
    statusKind.value = "error";
    status.value = "Host returned an invalid Mock model.";
    return;
  }
  table.value = model.table;
  mockCount.value = String(model.mockCount);
  if (model.mockStartIndex === "auto") {
    startMode.value = "auto";
  } else {
    startMode.value = "manual";
    startIndex.value = String(model.mockStartIndex);
  }
  mockValueReference.value = model.mockValueReference || mockValueReference.value;
  rows.value = Object.entries(model.mock).map(([name, field]) => ({
    name,
    type: field.type,
    nullable: field.nullable === true,
    isIndex: field.value === "#mockIndex" || field.value === "$mockIndex",
    enabled: true,
    value: field.value,
  }));
  loading.value = false;
  statusKind.value = "normal";
  status.value = "";
}

const enabledRows = computed(() => rows.value.filter((row) => row.enabled));
const allSelected = computed({
  get: () => rows.value.length > 0 && enabledRows.value.length === rows.value.length,
  set: (value: boolean) => {
    for (const row of rows.value) row.enabled = value;
  },
});
const partiallySelected = computed(() =>
  enabledRows.value.length > 0 && enabledRows.value.length < rows.value.length,
);

function createModel(): MockModel {
  const raw = {
    table: table.value,
    mockCount: mockCount.value,
    mockStartIndex: startMode.value === "auto" ? "auto" : startIndex.value,
    mockValueReference: mockValueReference.value,
    mock: Object.fromEntries(
      enabledRows.value.map((row) => [row.name, {
        type: row.type,
        value: row.value,
        nullable: row.nullable,
      }]),
    ),
  };
  const model = normalizeMockModel(raw);
  if (!model) throw new Error("A table is required before saving the Mock model.");
  return model;
}

function persist(): void {
  if (loading.value || !table.value) return;
  try {
    bridge?.emit("saveMock", createModel());
  } catch (error) {
    statusKind.value = "error";
    status.value = text(error, "Unable to save Mock model.");
  }
}

function save(): void {
  persist();
  statusKind.value = "success";
  status.value = "Mock model saved.";
}

function reset(): void {
  loading.value = true;
  statusKind.value = "normal";
  status.value = "Loading default Mock model…";
  bridge?.emit("resetMock");
}

function run(): void {
  if (enabledRows.value.length === 0) {
    statusKind.value = "error";
    status.value = "Select at least one column.";
    return;
  }
  try {
    generating.value = true;
    statusKind.value = "normal";
    status.value = "Generating mock data…";
    bridge?.emit("runMock", createModel());
  } catch (error) {
    generating.value = false;
    statusKind.value = "error";
    status.value = text(error, "Unable to run Mock.");
  }
}

function refresh(): void {
  loading.value = true;
  statusKind.value = "normal";
  status.value = "Refreshing Mock model…";
  bridge?.init("mock");
}

onMounted(() => {
  modelSubscription = bridge?.on("mockMeta", applyModel);
  doneSubscription = bridge?.on("mock_done", (content) => {
    const result = record(content);
    generating.value = false;
    statusKind.value = result.success === false ? "error" : "success";
    status.value = text(
      result.message,
      result.success === false ? "Mock generation failed." : "Mock data generated.",
    );
  });
  refreshSubscription = bridge?.on("refresh_mock", refresh);
  errorSubscription = bridge?.on("error", (content) => {
    generating.value = false;
    statusKind.value = "error";
    status.value = text(record(content).message || content, "Mock action failed.");
  });

  const initialState = record(bootstrap.state);
  if (initialState.mock) applyModel(initialState.mock);
  bridge?.init("mock");
});

onBeforeUnmount(() => {
  modelSubscription?.dispose();
  doneSubscription?.dispose();
  refreshSubscription?.dispose();
  errorSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace mock-view"
    data-route="mock"
  >
    <header class="route-workspace__header">
      <div>
        <h1>
          <span class="mock-view__table-icon">▦</span>
          {{ table || "Data Mock" }}
        </h1>
        <p class="route-workspace__subline">
          Configure generated rows for the selected table.
        </p>
      </div>
      <div class="route-workspace__actions">
        <VscButton
          @click="refresh"
        >
          Refresh
        </VscButton>
        <VscButton
          type="default"
          @click="save"
        >
          Save
        </VscButton>
      </div>
    </header>

    <div class="mock-view__header-row">
      <p class="mock-view__notice">
        Values use Mock.js expressions where supported by the selected database.
      </p>
      <a
        class="mock-view__reference"
        :href="mockValueReference"
        target="_blank"
        rel="noreferrer"
      >
        MockJS reference ↗
      </a>
    </div>

    <div class="mock-view__config">
      <UiInput
        v-model="mockCount"
        label="Rows"
        type="number"
        @update:model-value="persist"
      />
      <label class="vsc-field">
        <span class="vsc-field__label">Start index</span>
        <select
          v-model="startMode"
          class="vsc-input"
          @change="persist"
        >
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </select>
      </label>
      <UiInput
        v-if="startMode === 'manual'"
        v-model="startIndex"
        label="Manual index"
        type="number"
        @update:model-value="persist"
      />
    </div>

    <div class="mock-view__table-wrap">
      <table class="mock-view__table">
        <thead>
          <tr>
            <th class="mock-view__checkbox-cell">
              <input
                v-model="allSelected"
                type="checkbox"
                :indeterminate="partiallySelected"
                aria-label="Select all columns"
                @change="persist"
              >
            </th>
            <th>Name</th>
            <th>Type</th>
            <th>Nullable</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody v-if="rows.length > 0">
          <tr
            v-for="row in rows"
            :key="row.name"
          >
            <td class="mock-view__checkbox-cell">
              <input
                v-model="row.enabled"
                type="checkbox"
                :aria-label="`Enable ${row.name}`"
                @change="persist"
              >
            </td>
            <td>{{ row.name }}</td>
            <td>{{ row.type }}</td>
            <td class="mock-view__nullable-cell">
              {{ row.nullable ? "✅" : "❌" }}
            </td>
            <td>
              <input
                v-model="row.value"
                class="vsc-input mock-view__value-input"
                :disabled="!row.enabled"
                :placeholder="row.isIndex ? 'Primary-key index' : 'Mock.js expression'"
                @change="persist"
              >
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr>
            <td
              class="mock-view__empty"
              colspan="5"
            >
              {{ loading ? "Loading columns…" : "No mockable columns found." }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mock-view__footer">
      <VscButton
        type="default"
        @click="reset"
      >
        Reset
      </VscButton>
      <VscButton
        type="primary"
        :disabled="generating || loading"
        @click="run"
      >
        {{ generating ? "Generating…" : "Generate" }}
      </VscButton>
    </div>

    <p
      v-if="status"
      class="route-workspace__status"
      :class="`mock-view__status--${statusKind}`"
    >
      {{ status }}
    </p>
  </section>
</template>
