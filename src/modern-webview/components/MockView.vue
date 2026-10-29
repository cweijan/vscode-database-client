<script setup lang="ts">
import {
  ElCheckbox,
  ElInput,
  ElInputNumber,
  ElRadio,
  ElRadioGroup,
} from "element-plus";
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";

import { type MockModel, normalizeMockModel } from "../../modern/database/mockModel";
import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import { createTranslator } from "../i18n";
import { usePayState } from "../license";

interface MockRow {
  name: string;
  type: string;
  nullable: boolean;
  isIndex: boolean;
  enabled: boolean;
  value: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const translator = createTranslator(bootstrap.language);
const isPay = usePayState();

const table = ref("");
const mockCount = ref(10);
const startMode = ref<"auto" | "manual">("auto");
const startIndex = ref(1);
const mockValueReference = ref("http://mockjs.com/examples.html#DPD");
const rows = ref<MockRow[]>([]);
const loading = ref(false);
const generating = ref(false);
let modelSubscription: BridgeDisposable | undefined;
let doneSubscription: BridgeDisposable | undefined;
let refreshSubscription: BridgeDisposable | undefined;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function applyModel(content: unknown): void {
  loading.value = false;
  const model = normalizeMockModel(content);
  if (!model) return;
  table.value = model.table;
  mockCount.value = Number(model.mockCount) || 10;
  mockValueReference.value = model.mockValueReference || mockValueReference.value;
  if (model.mockStartIndex === "auto") {
    startMode.value = "auto";
  } else {
    startMode.value = "manual";
    startIndex.value = Number(model.mockStartIndex) || 1;
  }
  rows.value = Object.entries(model.mock).map(([name, field]) => ({
    name,
    type: field.type,
    value: field.value ?? "",
    enabled: true,
    isIndex: field.value === "#mockIndex" || field.value === "$mockIndex",
    nullable: field.nullable === true,
  }));
}

const enabledRows = computed(() => rows.value.filter((row) => row.enabled));

const allSelected = computed({
  get: () => rows.value.length > 0 && enabledRows.value.length === rows.value.length,
  set: (value: boolean) => {
    for (const row of rows.value) row.enabled = value;
  },
});

const partiallySelected = computed(
  () => enabledRows.value.length > 0 && enabledRows.value.length < rows.value.length,
);

function buildModel(): MockModel {
  const raw = {
    table: table.value,
    mockCount: mockCount.value,
    mockStartIndex: startMode.value === "auto" ? "auto" : startIndex.value,
    mockValueReference: mockValueReference.value,
    mock: Object.fromEntries(
      enabledRows.value.map((row) => [row.name, {
        type: row.type,
        value: row.value,
      }]),
    ),
  };
  const model = normalizeMockModel(raw);
  if (!model) throw new Error("A table is required before saving the Mock model.");
  return model;
}

function setMockCount(value: number | undefined): void {
  mockCount.value = Number(value ?? 1);
}

function setStartIndex(value: number | undefined): void {
  startIndex.value = Number(value ?? 0);
}

function setStartMode(value: string | number | boolean | undefined): void {
  startMode.value = value === "manual" ? "manual" : "auto";
}

function setAllSelected(value: string | number | boolean): void {
  allSelected.value = Boolean(value);
}

function setRowEnabled(row: MockRow, value: unknown): void {
  row.enabled = Boolean(value);
}

function save(): void {
  if (!table.value) return;
  try {
    bridge?.emit("saveMock", buildModel());
  } catch {
    // The host reports validation failures through the page protocol.
  }
}

function load(): void {
  loading.value = true;
  bridge?.emit("init", { type: "mock" });
}

function reset(): void {
  bridge?.emit("resetMock");
}

function run(): void {
  if (enabledRows.value.length === 0) return;
  generating.value = true;
  bridge?.emit("runMock", buildModel());
}

onMounted(() => {
  modelSubscription = bridge?.on("mockMeta", applyModel);
  doneSubscription = bridge?.on("mock_done", () => {
    generating.value = false;
  });
  refreshSubscription = bridge?.on("refresh_mock", load);
  const initialState = record(bootstrap.state);
  if (initialState.mock) applyModel(initialState.mock);
  load();
});

onBeforeUnmount(() => {
  modelSubscription?.dispose();
  doneSubscription?.dispose();
  refreshSubscription?.dispose();
});
</script>

<template>
  <div class="mock-container">
    <div
      id="mockPanel"
      class="mock-header"
    >
      <div class="mock-header__main">
        <span class="mock-table">
          <i class="codicon-table blue mr-1" />
          {{ table }}
        </span>
        <p class="mock-notice">
          {{ translator.t("mock.notice", "Mock data follows the Mock.js expression syntax.") }}
        </p>
      </div>
      <a
        class="mock-reference"
        :href="mockValueReference"
        target="_blank"
        rel="noreferrer"
      >
        <i class="codicon-link-external" />
        MockJS
      </a>
    </div>

    <div class="mock-config">
      <div class="mock-config__row">
        <span class="mock-config__label">{{ translator.t("mock.count", "Count") }}</span>
        <ElInputNumber
          :model-value="mockCount"
          :min="1"
          :max="10000"
          size="small"
          @update:model-value="setMockCount"
          @change="save"
        />
      </div>
      <div class="mock-config__row">
        <span class="mock-config__label">{{ translator.t("mock.startIndex", "Start index") }}</span>
        <ElRadioGroup
          :model-value="startMode"
          size="small"
          @update:model-value="setStartMode"
          @change="save"
        >
          <ElRadio
            value="auto"
            :label="translator.t('mock.auto', 'Auto')"
          />
          <ElRadio
            value="manual"
            :label="translator.t('mock.manual', 'Manual')"
          />
        </ElRadioGroup>
        <ElInputNumber
          v-if="startMode === 'manual'"
          :model-value="startIndex"
          :min="0"
          size="small"
          @update:model-value="setStartIndex"
          @change="save"
        />
      </div>
    </div>

    <div class="mock-data-table-wrap">
      <VscTable
        class="mock-data-table"
        :data="rows"
        row-key="name"
        :loading="loading"
      >
        <VscTableColumn
          width="50"
          align="center"
        >
          <template #header>
            <ElCheckbox
              :model-value="allSelected"
              :indeterminate="partiallySelected"
              @update:model-value="setAllSelected"
              @change="save"
            />
          </template>
          <template #default="{ row }">
            <ElCheckbox
              :model-value="row.enabled"
              @update:model-value="(value: unknown) => setRowEnabled(row, value)"
              @change="save"
            />
          </template>
        </VscTableColumn>
        <VscTableColumn
          prop="name"
          :label="translator.t('common.name', 'Name')"
          width="160"
        />
        <VscTableColumn
          prop="type"
          :label="translator.t('common.type', 'Type')"
          width="130"
        />
        <VscTableColumn
          :label="translator.t('mock.nullable', 'Nullable')"
          width="80"
          align="center"
        >
          <template #default="{ row }">
            {{ row.nullable ? "✅" : "❌" }}
          </template>
        </VscTableColumn>
        <VscTableColumn
          :label="translator.t('mock.value', 'Value')"
          min-width="200"
        >
          <template #default="{ row }">
            <ElInput
              v-model="row.value"
              size="small"
              :disabled="!row.enabled"
              :placeholder="row.isIndex ? translator.t('mock.indexHint', 'Primary key index') : ''"
              @change="save"
            />
          </template>
        </VscTableColumn>
      </VscTable>
    </div>

    <div class="mock-footer">
      <VscButton
        type="secondary"
        @click="reset"
      >
        {{ translator.t("mock.reset", "Reset") }}
      </VscButton>
      <PayBadge>
        <VscButton
          type="primary"
          :loading="generating"
          :disabled="!isPay"
          @click="run"
        >
          {{ translator.t("mock.generate", "Generate") }}
        </VscButton>
      </PayBadge>
    </div>
  </div>
</template>
