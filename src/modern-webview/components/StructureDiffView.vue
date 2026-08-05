<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import UiButton from "./UiButton.vue";
import UiSelect from "./UiSelect.vue";

interface ConnectionNode {
  readonly key: string;
  readonly label?: string;
  readonly name?: string;
  readonly dbType?: string;
  readonly host?: string;
  readonly port?: number | string;
  readonly group?: string;
}

interface DiffOption {
  readonly label: string;
  readonly key: string;
}

interface DiffItem {
  readonly [key: string]: unknown;
}

interface DiffEntry {
  readonly index: number;
  readonly item: DiffItem;
}

interface DiffGroup {
  readonly name: string;
  readonly entries: readonly DiffEntry[];
}

interface DiffSide {
  connectionKey: string;
  databaseKey: string;
  database: string;
  schemaKey: string;
  schema: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const connections = ref<ConnectionNode[]>([]);
const sourceDatabases = ref<DiffOption[]>([]);
const targetDatabases = ref<DiffOption[]>([]);
const sourceSchemas = ref<DiffOption[]>([]);
const targetSchemas = ref<DiffOption[]>([]);
const sourceError = ref("");
const targetError = ref("");
const status = ref("");
const error = ref("");
const comparing = ref(false);
const syncing = ref(false);
const sqlList = ref<DiffItem[]>([]);
const selectedIndexes = ref<Set<number>>(new Set());
const expandedGroups = ref<Set<string>>(new Set());
const lastOption = ref<Record<string, unknown>>({});
const subscriptions: BridgeDisposable[] = [];
const source = reactive<DiffSide>(createSide());
const target = reactive<DiffSide>(createSide());

const connectionOptions = computed(() => {
  const options = connections.value.map((connection) => ({
    value: connection.key,
    label: connectionLabel(connection),
  }));
  return options.length > 0
    ? [{ value: "", label: "Select connection" }, ...options]
    : [{ value: "", label: "No connection available" }];
});

const sourceDatabaseOptions = computed(() => optionList(sourceDatabases.value, "Select database"));
const targetDatabaseOptions = computed(() => optionList(targetDatabases.value, "Select database"));
const sourceSchemaOptions = computed(() => optionList(sourceSchemas.value, "Select schema"));
const targetSchemaOptions = computed(() => optionList(targetSchemas.value, "Select schema"));

const sourceConnection = computed(() => findConnection(source.connectionKey));
const targetConnection = computed(() => findConnection(target.connectionKey));
const sourceUsesSchema = computed(() => usesSchema(sourceConnection.value));
const targetUsesSchema = computed(() => usesSchema(targetConnection.value));
const canCompare = computed(() => Boolean(
  source.connectionKey
  && target.connectionKey
  && source.databaseKey
  && target.databaseKey
  && (!sourceUsesSchema.value || source.schemaKey)
  && (!targetUsesSchema.value || target.schemaKey),
));

const groups = computed<DiffGroup[]>(() => {
  const grouped = new Map<string, DiffEntry[]>();
  sqlList.value.forEach((item, index) => {
    const name = itemName(item);
    const entries = grouped.get(name) ?? [];
    entries.push({ index, item });
    grouped.set(name, entries);
  });
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, entries]) => ({ name, entries }));
});

const selectedItems = computed(() => sqlList.value.filter((_item, index) => selectedIndexes.value.has(index)));
const allSelected = computed(() => sqlList.value.length > 0 && selectedIndexes.value.size === sqlList.value.length);
const partialSelection = computed(() => selectedIndexes.value.size > 0 && !allSelected.value);
const sqlPreview = computed(() => selectedItems.value
  .map((item) => stringValue(item.sql).trim())
  .filter(Boolean)
  .map((sql) => sql.endsWith(";") ? sql : `${sql};`)
  .join("\n\n"));

function createSide(): DiffSide {
  return {
    connectionKey: "",
    databaseKey: "",
    database: "",
    schemaKey: "",
    schema: "",
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function connectionLabel(connection: ConnectionNode): string {
  const label = connection.label || connection.name || connection.key;
  const host = connection.host ? ` @ ${connection.host}${connection.port ? `:${connection.port}` : ""}` : "";
  return `${label}${host}`;
}

function optionList(options: readonly DiffOption[], placeholder: string): Array<{ value: string; label: string }> {
  return [{ value: "", label: placeholder }, ...options.map((option) => ({
    value: option.key,
    label: option.label,
  }))];
}

function findConnection(key: string): ConnectionNode | undefined {
  return connections.value.find((connection) => connection.key === key);
}

function usesSchema(connection: ConnectionNode | undefined): boolean {
  return Boolean(connection?.dbType && /postgres/i.test(connection.dbType));
}

function normalizeConnection(value: unknown): ConnectionNode | undefined {
  const input = record(value);
  const key = stringValue(input.key);
  if (!key) return undefined;
  return {
    key,
    label: stringValue(input.label),
    name: stringValue(input.name),
    dbType: stringValue(input.dbType),
    host: stringValue(input.host),
    port: typeof input.port === "number" || typeof input.port === "string" ? input.port : undefined,
    group: stringValue(input.group),
  };
}

function normalizeOptions(value: unknown): DiffOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const input = record(item);
    return {
      label: stringValue(input.label || input.name, "Unnamed"),
      key: stringValue(input.key || input.label || input.name),
    };
  }).filter((option) => option.key);
}

function normalizeItems(value: unknown): DiffItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DiffItem => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function itemName(item: DiffItem): string {
  return stringValue(item.table || item.name || item.objectType || item.type, "Other");
}

function itemTitle(item: DiffItem): string {
  const name = stringValue(item.name);
  const objectType = stringValue(item.objectType || item.type, "change");
  return name ? `${objectType}: ${name}` : objectType;
}

function itemDetail(item: DiffItem): string {
  return stringValue(item.detail || item.type || item.objectType);
}

function childItems(item: DiffItem): DiffItem[] {
  const children = record(item.children);
  const columns = Array.isArray(children.columns) ? children.columns : [];
  const keys = Array.isArray(children.keys) ? children.keys : [];
  return [...columns, ...keys].filter((child): child is DiffItem => Boolean(
    child && typeof child === "object" && !Array.isArray(child),
  ));
}

function subscribe(type: string, handler: (content: unknown) => void): void {
  const subscription = bridge?.on(type, handler);
  if (subscription) subscriptions.push(subscription);
}

function emit(type: string, content?: unknown): void {
  bridge?.emit(type, content);
}

function resetSide(side: DiffSide, isTarget: boolean): void {
  side.databaseKey = "";
  side.database = "";
  side.schemaKey = "";
  side.schema = "";
  if (isTarget) {
    targetDatabases.value = [];
    targetSchemas.value = [];
    targetError.value = "";
  } else {
    sourceDatabases.value = [];
    sourceSchemas.value = [];
    sourceError.value = "";
  }
  clearResult();
}

function chooseConnection(isTarget: boolean, key: string): void {
  const side = isTarget ? target : source;
  side.connectionKey = key;
  resetSide(side, isTarget);
  if (key) {
    emit("loadDB", { key, isTarget });
  }
}

function chooseDatabase(isTarget: boolean, key: string): void {
  const side = isTarget ? target : source;
  const options = isTarget ? targetDatabases.value : sourceDatabases.value;
  const selected = options.find((option) => option.key === key);
  side.databaseKey = key;
  side.database = selected?.label || "";
  side.schemaKey = "";
  side.schema = "";
  if (isTarget) {
    targetSchemas.value = [];
  } else {
    sourceSchemas.value = [];
  }
  clearResult();
  if (key && usesSchema(isTarget ? targetConnection.value : sourceConnection.value)) {
    emit("loadSchema", { dbKey: key, isTarget });
  }
}

function chooseSchema(isTarget: boolean, key: string): void {
  const side = isTarget ? target : source;
  const options = isTarget ? targetSchemas.value : sourceSchemas.value;
  const selected = options.find((option) => option.key === key);
  side.schemaKey = key;
  side.schema = selected?.label || "";
  clearResult();
}

function compareSide(side: DiffSide): Record<string, unknown> {
  return {
    database: side.database,
    schema: side.schema,
    db: side.databaseKey ? { key: side.databaseKey, label: side.database } : undefined,
    schemaNode: side.schemaKey ? { key: side.schemaKey, label: side.schema } : undefined,
  };
}

function compare(): void {
  if (!canCompare.value) {
    error.value = "Select a source and target connection and database before comparing.";
    return;
  }
  error.value = "";
  status.value = "";
  comparing.value = true;
  const option = {
    from: compareSide(source),
    to: compareSide(target),
  };
  emit("compare", option);
}

function clearResult(): void {
  sqlList.value = [];
  selectedIndexes.value = new Set();
  expandedGroups.value = new Set();
  lastOption.value = {};
}

function toggleGroup(name: string): void {
  const next = new Set(expandedGroups.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  expandedGroups.value = next;
}

function isExpanded(name: string): boolean {
  return expandedGroups.value.has(name);
}

function isSelected(index: number): boolean {
  return selectedIndexes.value.has(index);
}

function toggleItem(index: number, checked: boolean): void {
  const next = new Set(selectedIndexes.value);
  if (checked) next.add(index);
  else next.delete(index);
  selectedIndexes.value = next;
}

function groupSelected(group: DiffGroup): boolean {
  return group.entries.length > 0 && group.entries.every((entry) => selectedIndexes.value.has(entry.index));
}

function toggleGroupSelection(group: DiffGroup, checked: boolean): void {
  const next = new Set(selectedIndexes.value);
  for (const entry of group.entries) {
    if (checked) next.add(entry.index);
    else next.delete(entry.index);
  }
  selectedIndexes.value = next;
}

function toggleAll(checked: boolean): void {
  selectedIndexes.value = checked
    ? new Set(sqlList.value.map((_item, index) => index))
    : new Set();
}

function openQuery(): void {
  if (selectedItems.value.length === 0) {
    error.value = "Select at least one change first.";
    return;
  }
  emit("openQuery", { sqlList: selectedItems.value, option: lastOption.value });
}

function sync(): void {
  if (selectedItems.value.length === 0) {
    error.value = "Select at least one change first.";
    return;
  }
  error.value = "";
  syncing.value = true;
  emit("sync", { sqlList: selectedItems.value, option: lastOption.value });
}

function refresh(): void {
  clearResult();
  emit("getUser");
}

onMounted(() => {
  subscribe("nodes", (content) => {
    connections.value = Array.isArray(content)
      ? content.map(normalizeConnection).filter((item): item is ConnectionNode => Boolean(item))
      : [];
  });
  subscribe("sourceDB", (content) => {
    const input = record(content);
    sourceDatabases.value = normalizeOptions(input.dbList);
    sourceError.value = stringValue(input.error);
  });
  subscribe("targetDB", (content) => {
    const input = record(content);
    targetDatabases.value = normalizeOptions(input.dbList);
    targetError.value = stringValue(input.error);
  });
  subscribe("sourceSchema", (content) => {
    const input = record(content);
    sourceSchemas.value = normalizeOptions(input.schemaList);
    sourceError.value = stringValue(input.error);
  });
  subscribe("targetSchema", (content) => {
    const input = record(content);
    targetSchemas.value = normalizeOptions(input.schemaList);
    targetError.value = stringValue(input.error);
  });
  subscribe("compareResult", (content) => {
    const input = record(content);
    sqlList.value = normalizeItems(input.sqlList);
    selectedIndexes.value = new Set(sqlList.value.map((_item, index) => index));
    expandedGroups.value = new Set(groups.value.map((group) => group.name));
    lastOption.value = record(input.option);
    comparing.value = false;
    status.value = sqlList.value.length > 0 ? `${sqlList.value.length} change(s) found.` : "No structural difference found.";
  });
  subscribe("syncSuccess", () => {
    syncing.value = false;
    status.value = "Selected changes synchronized.";
    clearResult();
  });
  subscribe("success", (content) => {
    syncing.value = false;
    comparing.value = false;
    status.value = stringValue(record(content).message || content, "Structure operation completed.");
  });
  subscribe("error", (content) => {
    comparing.value = false;
    syncing.value = false;
    error.value = stringValue(record(content).message || content, "Structure operation failed.");
  });
  bridge?.init("structDiff");
  emit("getUser");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <section
    class="route-workspace structure-diff-view"
    data-route="structDiff"
  >
    <header class="route-workspace__header">
      <div>
        <h1>Structure diff</h1>
        <p class="route-workspace__subline">
          Compare metadata from a source database with a target database.
        </p>
      </div>
      <UiButton
        type="button"
        variant="default"
        @click="refresh"
      >
        Refresh connections
      </UiButton>
    </header>

    <p
      v-if="status"
      class="route-workspace__status"
      aria-live="polite"
    >
      {{ status }}
    </p>
    <p
      v-if="error"
      class="route-workspace__error"
      role="alert"
    >
      {{ error }}
    </p>

    <div class="structure-diff-view__columns">
      <article class="structure-diff-view__side structure-diff-view__side--source">
        <header class="structure-diff-view__side-header">
          <h2>Source</h2>
          <span class="structure-diff-view__side-marker">FROM</span>
        </header>
        <UiSelect
          :model-value="source.connectionKey"
          label="Connection"
          :options="connectionOptions"
          @update:model-value="chooseConnection(false, $event)"
        />
        <UiSelect
          :model-value="source.databaseKey"
          label="Database"
          :disabled="!source.connectionKey"
          :options="sourceDatabaseOptions"
          @update:model-value="chooseDatabase(false, $event)"
        />
        <UiSelect
          v-if="sourceUsesSchema"
          :model-value="source.schemaKey"
          label="Schema"
          :disabled="!source.databaseKey"
          :options="sourceSchemaOptions"
          @update:model-value="chooseSchema(false, $event)"
        />
        <p
          v-if="sourceError"
          class="route-workspace__error"
        >
          {{ sourceError }}
        </p>
      </article>

      <div
        class="structure-diff-view__arrow"
        aria-hidden="true"
      >
        →
      </div>

      <article class="structure-diff-view__side structure-diff-view__side--target">
        <header class="structure-diff-view__side-header">
          <h2>Target</h2>
          <span class="structure-diff-view__side-marker">TO</span>
        </header>
        <UiSelect
          :model-value="target.connectionKey"
          label="Connection"
          :options="connectionOptions"
          @update:model-value="chooseConnection(true, $event)"
        />
        <UiSelect
          :model-value="target.databaseKey"
          label="Database"
          :disabled="!target.connectionKey"
          :options="targetDatabaseOptions"
          @update:model-value="chooseDatabase(true, $event)"
        />
        <UiSelect
          v-if="targetUsesSchema"
          :model-value="target.schemaKey"
          label="Schema"
          :disabled="!target.databaseKey"
          :options="targetSchemaOptions"
          @update:model-value="chooseSchema(true, $event)"
        />
        <p
          v-if="targetError"
          class="route-workspace__error"
        >
          {{ targetError }}
        </p>
      </article>
    </div>

    <div class="route-workspace__actions structure-diff-view__actions">
      <UiButton
        type="button"
        :disabled="!canCompare || comparing"
        @click="compare"
      >
        {{ comparing ? "Comparing…" : "Compare" }}
      </UiButton>
      <span class="route-workspace__subline">
        Select both sides before comparing.
      </span>
    </div>

    <section
      v-if="sqlList.length > 0"
      class="structure-diff-view__result"
    >
      <header class="structure-diff-view__result-header">
        <div>
          <h2>Migration plan</h2>
          <p class="route-workspace__subline">
            {{ selectedItems.length }} of {{ sqlList.length }} change(s) selected
          </p>
        </div>
        <div class="route-workspace__actions">
          <UiButton
            type="button"
            variant="default"
            @click="openQuery"
          >
            Open in query
          </UiButton>
          <UiButton
            type="button"
            :disabled="syncing"
            @click="sync"
          >
            {{ syncing ? "Synchronizing…" : "Synchronize" }}
          </UiButton>
        </div>
      </header>

      <label class="structure-diff-view__select-all">
        <input
          type="checkbox"
          :checked="allSelected"
          :indeterminate="partialSelection"
          @change="toggleAll(($event.target as HTMLInputElement).checked)"
        >
        Select all changes
      </label>

      <div class="structure-diff-view__tree">
        <article
          v-for="group in groups"
          :key="group.name"
          class="structure-diff-view__group"
        >
          <header class="structure-diff-view__group-header">
            <UiButton
              type="button"
              variant="default"
              @click="toggleGroup(group.name)"
            >
              {{ isExpanded(group.name) ? "▾" : "▸" }}
            </UiButton>
            <input
              type="checkbox"
              :checked="groupSelected(group)"
              @change="toggleGroupSelection(group, ($event.target as HTMLInputElement).checked)"
            >
            <strong>{{ group.name }}</strong>
            <span class="route-workspace__subline">{{ group.entries.length }} change(s)</span>
          </header>
          <div
            v-if="isExpanded(group.name)"
            class="structure-diff-view__items"
          >
            <div
              v-for="entry in group.entries"
              :key="entry.index"
              class="structure-diff-view__item"
            >
              <input
                type="checkbox"
                :checked="isSelected(entry.index)"
                @change="toggleItem(entry.index, ($event.target as HTMLInputElement).checked)"
              >
              <div>
                <div class="structure-diff-view__item-title">
                  {{ itemTitle(entry.item) }}
                  <span class="structure-diff-view__item-detail">{{ itemDetail(entry.item) }}</span>
                </div>
                <code>{{ stringValue(entry.item.sql) }}</code>
                <ul
                  v-if="childItems(entry.item).length > 0"
                  class="structure-diff-view__children"
                >
                  <li
                    v-for="(child, childIndex) in childItems(entry.item)"
                    :key="`${entry.index}-${childIndex}`"
                  >
                    {{ stringValue(child.name, stringValue(child.type, "child")) }}
                    <span>{{ stringValue(child.detail) }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </article>
      </div>

      <label class="vsc-field vsc-field--wide structure-diff-view__preview">
        <span class="vsc-field__label">SQL preview</span>
        <textarea
          class="console-view__editor"
          :value="sqlPreview"
          readonly
        />
      </label>
    </section>
    <p
      v-else-if="status === 'No structural difference found.'"
      class="route-workspace__empty"
    >
      No structural difference found.
    </p>
  </section>
</template>
