<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";

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

interface DiffGroup {
  readonly name: string;
  readonly type: DiffAction;
  readonly items: readonly DiffItem[];
  readonly columns: readonly DiffChild[];
  readonly keys: readonly DiffChild[];
}

interface DiffChild {
  readonly name: string;
  readonly detail: string;
  readonly type: DiffAction;
}

interface DiffSide {
  connectionKey: string;
  databaseKey: string;
  database: string;
  schemaKey: string;
  schema: string;
}

interface StructureDiffProps {
  readonly embedded?: boolean;
}

type DiffAction = "create" | "modify" | "change" | "drop";
type ServiceType = "MySQL" | "PostgreSQL";

const props = defineProps<StructureDiffProps>();
const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const connections = ref<ConnectionNode[]>([]);
const serviceType = ref<ServiceType>("MySQL");
const isPay = ref(true);
const sourceDatabases = ref<DiffOption[]>([]);
const targetDatabases = ref<DiffOption[]>([]);
const sourceSchemas = ref<DiffOption[]>([]);
const targetSchemas = ref<DiffOption[]>([]);
const sourceDbLoading = ref(false);
const targetDbLoading = ref(false);
const sourceSchemaLoading = ref(false);
const targetSchemaLoading = ref(false);
const sourceDbError = ref("");
const targetDbError = ref("");
const sourceSchemaError = ref("");
const targetSchemaError = ref("");
const status = ref("");
const error = ref("");
const comparing = ref(false);
const syncing = ref(false);
const sqlList = ref<DiffItem[]>([]);
const resultVisible = ref(false);
const selectedTables = ref<Set<string>>(new Set());
const expandedNodes = ref<Set<string>>(new Set(["root", "tables"]));
const activeTable = ref("");
const lastOption = ref<Record<string, unknown>>({});
const subscriptions: BridgeDisposable[] = [];
const source = reactive<DiffSide>(createSide());
const target = reactive<DiffSide>(createSide());

function serverIcon(relativePath: string): string {
  const configuredBase = bootstrap.config.assetBase;
  if (typeof configuredBase === "string" && configuredBase.length > 0) {
    const base = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;
    return new URL(`icon/server/${relativePath}`, base).toString();
  }
  return `resources/icon/server/${relativePath}`;
}

const serviceTypes: ReadonlyArray<{ value: ServiceType; label: string; icon: string }> = [
  { value: "MySQL", label: "MySQL", icon: serverIcon("mysql_dark.svg") },
  { value: "PostgreSQL", label: "PostgreSQL", icon: serverIcon("postgresql.svg") },
];

const allServices: ReadonlyArray<{ value: string; icon: string }> = [
  { value: "MySQL", icon: serverIcon("mysql_dark.svg") },
  { value: "MariaDB", icon: serverIcon("mariadb.svg") },
  { value: "PostgreSQL", icon: serverIcon("postgresql.svg") },
];

const filteredConnections = computed(() => connections.value.filter((connection) => {
  const type = String(connection.dbType || "").trim().toLowerCase();
  if (serviceType.value === "MySQL") return type === "mysql" || type === "mariadb";
  return isPostgresCompatible(type);
}));

const sourceDatabasesOptions = computed(() => optionList(sourceDatabases.value, "Select database"));
const targetDatabasesOptions = computed(() => optionList(targetDatabases.value, "Select database"));
const sourceSchemasOptions = computed(() => optionList(sourceSchemas.value, "Select schema"));
const targetSchemasOptions = computed(() => optionList(targetSchemas.value, "Select schema"));

const sourceConnection = computed(() => findConnection(source.connectionKey));
const targetConnection = computed(() => findConnection(target.connectionKey));
const schemaRequired = computed(() => serviceType.value === "PostgreSQL");
const canCompare = computed(() => Boolean(
  source.connectionKey
  && target.connectionKey
  && source.databaseKey
  && target.databaseKey
  && (!schemaRequired.value || (source.schemaKey && target.schemaKey)),
));

const sourceInfo = computed(() => connectionInfo(sourceConnection.value, source));
const targetInfo = computed(() => connectionInfo(targetConnection.value, target));

const groups = computed<DiffGroup[]>(() => {
  const grouped = new Map<string, DiffItem[]>();
  for (const item of sqlList.value) {
    const name = itemName(item);
    const entries = grouped.get(name) ?? [];
    entries.push(item);
    grouped.set(name, entries);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, items]) => {
      const columns: DiffChild[] = [];
      const keys: DiffChild[] = [];
      for (const item of items) {
        if (item.objectType === "column" && stringValue(item.name)) {
          columns.push({
            name: stringValue(item.name),
            detail: stringValue(item.detail),
            type: itemAction(item),
          });
          continue;
        }
        const children = record(item.children);
        const action = itemAction(item);
        for (const child of childRecords(children.columns)) {
          columns.push({
            name: stringValue(child.name, "Unnamed column"),
            detail: stringValue(child.detail),
            type: action,
          });
        }
        for (const child of childRecords(children.keys)) {
          keys.push({
            name: stringValue(child.name, "Unnamed key"),
            detail: stringValue(child.detail),
            type: action,
          });
        }
      }
      return {
        name,
        type: groupAction(items),
        items,
        columns,
        keys,
      };
    });
});

const selectedItems = computed(() => sqlList.value.filter((item) => selectedTables.value.has(itemName(item))));
const allSelected = computed(() => groups.value.length > 0 && groups.value.every((group) => selectedTables.value.has(group.name)));
const partialSelection = computed(() => selectedTables.value.size > 0 && !allSelected.value);
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

function isPostgresCompatible(type: string): boolean {
  return /postgres|redshift|kingbase|gauss|cockroach|yugabyte|highgo/i.test(type);
}

function findConnection(key: string): ConnectionNode | undefined {
  return connections.value.find((connection) => connection.key === key);
}

function connectionLabel(connection: ConnectionNode | undefined): string {
  if (!connection) return "-";
  const label = connection.label || connection.name || connection.key;
  const host = connection.host ? ` @ ${connection.host}${connection.port ? `:${connection.port}` : ""}` : "";
  return `${label}${host}`;
}

function connectionOptionLabel(connection: ConnectionNode): string {
  return connection.group ? `${connectionLabel(connection)} (${connection.group})` : connectionLabel(connection);
}

function connectionIcon(connection: ConnectionNode | undefined): string {
  const type = String(connection?.dbType || "").trim().toLowerCase();
  const file = allServices.find((service) => service.value.toLowerCase() === type)?.icon
    || serviceTypes[0].icon;
  return file;
}

function connectionInfo(connection: ConnectionNode | undefined, side: DiffSide): Array<{ label: string; value: string }> {
  if (!connection) return [];
  return [
    { label: "Connection name", value: connection.name || connection.label || "-" },
    { label: "Host", value: connection.host || "-" },
    { label: "Port", value: String(connection.port ?? "-") },
    { label: "Database", value: side.schema && schemaRequired.value ? `${side.database}.${side.schema}` : side.database || "-" },
  ];
}

function optionList(options: readonly DiffOption[], placeholder: string): Array<{ value: string; label: string }> {
  return [{ value: "", label: placeholder }, ...options.map((option) => ({
    value: option.key,
    label: option.label,
  }))];
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
  return value.filter((item): item is DiffItem => Boolean(
    item && typeof item === "object" && !Array.isArray(item),
  ));
}

function itemName(item: DiffItem): string {
  return stringValue(item.table || item.name || item.objectType || item.type, "Other");
}

function itemAction(item: DiffItem): DiffAction {
  if (item.objectType === "table" && item.type === "add") return "create";
  if (item.objectType === "table" && item.type === "remove") return "drop";
  if (item.type === "add" || item.type === "remove") return "modify";
  return "change";
}

function groupAction(items: readonly DiffItem[]): DiffAction {
  if (items.some((item) => item.objectType === "table" && item.type === "add")) return "create";
  if (items.some((item) => item.objectType === "table" && item.type === "remove")) return "drop";
  if (items.some((item) => item.type === "add" || item.type === "remove")) return "modify";
  return "change";
}

function childRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(
      item && typeof item === "object" && !Array.isArray(item),
    ))
    : [];
}

function isExpanded(key: string): boolean {
  return expandedNodes.value.has(key);
}

function toggleExpanded(key: string): void {
  const next = new Set(expandedNodes.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedNodes.value = next;
}

function setTableSelected(name: string, checked: boolean): void {
  const next = new Set(selectedTables.value);
  if (checked) next.add(name);
  else next.delete(name);
  selectedTables.value = next;
  if (!activeTable.value || !next.has(activeTable.value)) activeTable.value = next.values().next().value || "";
}

function toggleAll(checked: boolean): void {
  selectedTables.value = checked ? new Set(groups.value.map((group) => group.name)) : new Set();
  if (!activeTable.value && groups.value.length > 0) activeTable.value = groups.value[0].name;
}

function resetResult(): void {
  sqlList.value = [];
  selectedTables.value = new Set();
  expandedNodes.value = new Set(["root", "tables"]);
  activeTable.value = "";
  lastOption.value = {};
  resultVisible.value = false;
}

function resetSide(side: DiffSide, isTarget: boolean): void {
  side.databaseKey = "";
  side.database = "";
  side.schemaKey = "";
  side.schema = "";
  if (isTarget) {
    targetDatabases.value = [];
    targetSchemas.value = [];
    targetDbError.value = "";
    targetSchemaError.value = "";
    targetDbLoading.value = false;
    targetSchemaLoading.value = false;
  } else {
    sourceDatabases.value = [];
    sourceSchemas.value = [];
    sourceDbError.value = "";
    sourceSchemaError.value = "";
    sourceDbLoading.value = false;
    sourceSchemaLoading.value = false;
  }
  resetResult();
}

function chooseConnection(isTarget: boolean, key: string): void {
  const side = isTarget ? target : source;
  side.connectionKey = key;
  resetSide(side, isTarget);
  if (key) {
    if (isTarget) targetDbLoading.value = true;
    else sourceDbLoading.value = true;
    bridge?.emit("loadDB", { key, isTarget });
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
    targetSchemaError.value = "";
  } else {
    sourceSchemas.value = [];
    sourceSchemaError.value = "";
  }
  resetResult();
  if (key && schemaRequired.value) {
    if (isTarget) targetSchemaLoading.value = true;
    else sourceSchemaLoading.value = true;
    bridge?.emit("loadSchema", { dbKey: key, isTarget });
  }
}

function chooseSchema(isTarget: boolean, key: string): void {
  const side = isTarget ? target : source;
  const options = isTarget ? targetSchemas.value : sourceSchemas.value;
  const selected = options.find((option) => option.key === key);
  side.schemaKey = key;
  side.schema = selected?.label || "";
  resetResult();
}

function compareSide(side: DiffSide): Record<string, unknown> {
  return {
    connection: side.connectionKey ? { key: side.connectionKey } : undefined,
    database: side.database,
    schema: side.schema,
    db: side.databaseKey ? { key: side.databaseKey, label: side.database } : undefined,
    schemaNode: side.schemaKey ? { key: side.schemaKey, label: side.schema } : undefined,
  };
}

function compare(): void {
  if (!canCompare.value) {
    error.value = "Select both connections, databases, and schemas before comparing.";
    return;
  }
  error.value = "";
  status.value = "";
  comparing.value = true;
  const option = {
    from: compareSide(source),
    to: compareSide(target),
  };
  bridge?.emit("start", option);
}

function selectedGroup(group: DiffGroup): boolean {
  return selectedTables.value.has(group.name);
}

function groupHasDetails(group: DiffGroup): boolean {
  return group.columns.length > 0 || group.keys.length > 0 || group.type === "create" || group.type === "drop";
}

function groupHasColumns(group: DiffGroup): boolean {
  return group.columns.length > 0 || group.type === "create" || group.type === "drop";
}

function groupHasKeys(group: DiffGroup): boolean {
  return group.keys.length > 0 || group.type === "create" || group.type === "drop";
}

function actionLabel(action: DiffAction): string {
  switch (action) {
    case "create": return "Create";
    case "drop": return "Drop";
    case "modify": return "Modify";
    case "change": return "Change";
  }
}

function openQuery(): void {
  if (selectedItems.value.length === 0) {
    error.value = "Select at least one table change first.";
    return;
  }
  bridge?.emit("openQuery", { sqlList: selectedItems.value, option: lastOption.value });
}

function sync(): void {
  if (selectedItems.value.length === 0) {
    error.value = "Select at least one table change first.";
    return;
  }
  error.value = "";
  syncing.value = true;
  bridge?.emit("sync", { sqlList: selectedItems.value, option: lastOption.value });
}

function closeResult(): void {
  resultVisible.value = false;
}

function resetSelections(): void {
  source.connectionKey = "";
  target.connectionKey = "";
  resetSide(source, false);
  resetSide(target, true);
  sourceDatabases.value = [];
  targetDatabases.value = [];
  sourceSchemas.value = [];
  targetSchemas.value = [];
  sourceDbLoading.value = false;
  targetDbLoading.value = false;
  sourceSchemaLoading.value = false;
  targetSchemaLoading.value = false;
  sourceDbError.value = "";
  targetDbError.value = "";
  sourceSchemaError.value = "";
  targetSchemaError.value = "";
  error.value = "";
  status.value = "";
}

function changeServiceType(value: ServiceType): void {
  if (serviceType.value === value) return;
  serviceType.value = value;
  resetSelections();
}

function refresh(): void {
  resetSelections();
  bridge?.emit("getUser");
}

function subscribe(type: string, handler: (content: unknown) => void): void {
  const subscription = bridge?.on(type, handler);
  if (subscription) subscriptions.push(subscription);
}

onMounted(() => {
  subscribe("nodes", (content) => {
    connections.value = Array.isArray(content)
      ? content.map(normalizeConnection).filter((item): item is ConnectionNode => Boolean(item))
      : [];
  });
  subscribe("user", (content) => {
    const input = record(content);
    if (typeof input.isPay === "boolean") isPay.value = input.isPay;
  });
  subscribe("sourceDB", (content) => {
    const input = record(content);
    sourceDbLoading.value = false;
    sourceDatabases.value = normalizeOptions(input.dbList);
    sourceDbError.value = stringValue(input.error);
  });
  subscribe("targetDB", (content) => {
    const input = record(content);
    targetDbLoading.value = false;
    targetDatabases.value = normalizeOptions(input.dbList);
    targetDbError.value = stringValue(input.error);
  });
  subscribe("sourceSchema", (content) => {
    const input = record(content);
    sourceSchemaLoading.value = false;
    sourceSchemas.value = normalizeOptions(input.schemaList);
    sourceSchemaError.value = stringValue(input.error);
  });
  subscribe("targetSchema", (content) => {
    const input = record(content);
    targetSchemaLoading.value = false;
    targetSchemas.value = normalizeOptions(input.schemaList);
    targetSchemaError.value = stringValue(input.error);
  });
  subscribe("compareResult", (content) => {
    const input = record(content);
    sqlList.value = normalizeItems(input.sqlList);
    selectedTables.value = new Set(groups.value.map((group) => group.name));
    expandedNodes.value = new Set(["root", "tables"]);
    activeTable.value = groups.value[0]?.name || "";
    lastOption.value = record(input.option);
    comparing.value = false;
    resultVisible.value = sqlList.value.length > 0;
    status.value = sqlList.value.length > 0 ? `${sqlList.value.length} change(s) found.` : "";
  });
  subscribe("syncSuccess", () => {
    syncing.value = false;
    status.value = "Selected changes synchronized.";
    resetResult();
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
  bridge?.emit("getUser");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <section
    class="struct-diff-page"
    :class="{ 'struct-diff-page--embedded': props.embedded }"
    data-route="structDiff"
  >
    <header
      v-if="!props.embedded"
      class="header-row"
    >
      <div class="header-main">
        <div class="page-title-row">
          <i class="codicon codicon-git-compare page-title__icon" aria-hidden="true" />
          <h2 class="page-title">Structure Diff</h2>
        </div>
        <p class="page-subtitle">Compare database structures and generate migration scripts.</p>
      </div>
    </header>

    <div class="service-row">
      <div class="service-type-row">
        <span class="service-type-row__label">Server type</span>
        <div
          class="service-type-options"
          role="radiogroup"
          aria-label="Server type"
        >
          <button
            v-for="item in serviceTypes"
            :key="item.value"
            class="service-type-option"
            :class="{ 'service-type-option--active': serviceType === item.value }"
            type="button"
            role="radio"
            :aria-checked="serviceType === item.value"
            @click="changeServiceType(item.value)"
          >
            <img
              class="service-type-option__icon"
              :src="item.icon"
              alt=""
            >
            <span>{{ item.label }}</span>
          </button>
        </div>
        <button
          class="vsc-button vsc-button--default struct-diff-refresh"
          type="button"
          title="Refresh"
          @click="refresh"
        >
          <i class="codicon codicon-refresh" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="config-panel">
      <article class="config-card">
        <header class="config-card__header">
          <i class="codicon codicon-database blue" aria-hidden="true" />
          <span>Reference</span>
        </header>
        <div class="config-form">
          <label class="config-field">
            <span class="config-field__label">Connection</span>
            <span class="config-select-wrap">
              <img
                v-if="sourceConnection"
                class="connection-select__icon"
                :src="connectionIcon(sourceConnection)"
                alt=""
              >
              <select
                class="config-select"
                :value="source.connectionKey"
                @change="chooseConnection(false, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Select connection</option>
                <option
                  v-for="connection in filteredConnections"
                  :key="connection.key"
                  :value="connection.key"
                >
                  {{ connectionOptionLabel(connection) }}
                </option>
              </select>
            </span>
          </label>
          <label class="config-field">
            <span class="config-field__label">Database</span>
            <select
              class="config-select"
              :value="source.databaseKey"
              :disabled="!source.connectionKey || sourceDbLoading"
              @change="chooseDatabase(false, ($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="option in sourceDatabasesOptions"
                :key="option.value || 'source-placeholder'"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <span
              v-if="sourceDbLoading"
              class="field-loading"
            >
              <i class="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
              Loading databases…
            </span>
            <span
              v-if="sourceDbError"
              class="field-error"
            >{{ sourceDbError }}</span>
          </label>
          <label
            v-if="schemaRequired"
            class="config-field"
          >
            <span class="config-field__label">Schema</span>
            <select
              class="config-select"
              :value="source.schemaKey"
              :disabled="!source.databaseKey || sourceSchemaLoading"
              @change="chooseSchema(false, ($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="option in sourceSchemasOptions"
                :key="option.value || 'source-schema-placeholder'"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <span
              v-if="sourceSchemaLoading"
              class="field-loading"
            >
              <i class="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
              Loading schemas…
            </span>
            <span
              v-if="sourceSchemaError"
              class="field-error"
            >{{ sourceSchemaError }}</span>
          </label>
        </div>
        <div
          v-if="sourceConnection"
          class="connection-info"
        >
          <div class="connection-info__title">Connection info</div>
          <div
            v-for="item in sourceInfo"
            :key="item.label"
            class="connection-info__row"
          >
            <span class="connection-info__label">{{ item.label }}:</span>
            <span class="connection-info__value">{{ item.value }}</span>
          </div>
        </div>
      </article>

      <div
        class="config-arrow"
        title="Synchronize from reference to target"
        aria-hidden="true"
      >
        <i class="codicon codicon-arrow-right" />
      </div>

      <article class="config-card config-card--target">
        <header class="config-card__header">
          <i class="codicon codicon-database orange" aria-hidden="true" />
          <span>Target</span>
        </header>
        <div class="config-form">
          <label class="config-field">
            <span class="config-field__label">Connection</span>
            <span class="config-select-wrap">
              <img
                v-if="targetConnection"
                class="connection-select__icon"
                :src="connectionIcon(targetConnection)"
                alt=""
              >
              <select
                class="config-select"
                :value="target.connectionKey"
                @change="chooseConnection(true, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Select connection</option>
                <option
                  v-for="connection in filteredConnections"
                  :key="connection.key"
                  :value="connection.key"
                >
                  {{ connectionOptionLabel(connection) }}
                </option>
              </select>
            </span>
          </label>
          <label class="config-field">
            <span class="config-field__label">Database</span>
            <select
              class="config-select"
              :value="target.databaseKey"
              :disabled="!target.connectionKey || targetDbLoading"
              @change="chooseDatabase(true, ($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="option in targetDatabasesOptions"
                :key="option.value || 'target-placeholder'"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <span
              v-if="targetDbLoading"
              class="field-loading"
            >
              <i class="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
              Loading databases…
            </span>
            <span
              v-if="targetDbError"
              class="field-error"
            >{{ targetDbError }}</span>
          </label>
          <label
            v-if="schemaRequired"
            class="config-field"
          >
            <span class="config-field__label">Schema</span>
            <select
              class="config-select"
              :value="target.schemaKey"
              :disabled="!target.databaseKey || targetSchemaLoading"
              @change="chooseSchema(true, ($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="option in targetSchemasOptions"
                :key="option.value || 'target-schema-placeholder'"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <span
              v-if="targetSchemaLoading"
              class="field-loading"
            >
              <i class="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
              Loading schemas…
            </span>
            <span
              v-if="targetSchemaError"
              class="field-error"
            >{{ targetSchemaError }}</span>
          </label>
        </div>
        <div
          v-if="targetConnection"
          class="connection-info"
        >
          <div class="connection-info__title">Connection info</div>
          <div
            v-for="item in targetInfo"
            :key="item.label"
            class="connection-info__row"
          >
            <span class="connection-info__label">{{ item.label }}:</span>
            <span class="connection-info__value">{{ item.value }}</span>
          </div>
        </div>
      </article>
    </div>

    <div class="action-row">
      <VscButton
        type="primary"
        :disabled="!canCompare || comparing || !isPay"
        @click="compare"
      >
        <i class="codicon codicon-git-compare" aria-hidden="true" />
        Compare
      </VscButton>
    </div>

    <div
      v-if="error"
      class="struct-diff-error"
      role="alert"
    >{{ error }}</div>
    <div
      v-if="comparing"
      class="loading-hint"
      aria-live="polite"
    >
      <i class="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
      <span>Comparing database structures…</span>
    </div>
    <div
      v-else-if="sqlList.length === 0 && status === ''"
      class="struct-diff-empty"
    />
    <div
      v-else-if="sqlList.length === 0 && status"
      class="empty-state"
    >
      <i class="codicon codicon-check green" aria-hidden="true" />
      <p class="empty-state__title">No structural differences</p>
      <p class="empty-state__hint">The selected databases already have the same table structure.</p>
    </div>

    <div
      v-if="resultVisible"
      class="struct-diff-dialog-backdrop"
      role="presentation"
      @click.self="closeResult"
    >
      <section
        class="struct-diff-result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="struct-diff-migration-title"
      >
        <header class="struct-diff-dialog__header">
          <h2 id="struct-diff-migration-title">Migration</h2>
          <button
            class="struct-diff-dialog__close"
            type="button"
            title="Close"
            @click="closeResult"
          >
            <i class="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>
        <div class="migration-panel">
          <div class="migration-trees">
            <div class="migration-tree-col">
              <div class="migration-tree-col__header">Reference</div>
              <div class="migration-tree-col__conn">{{ connectionLabel(sourceConnection) }}</div>
              <div class="migration-tree-col__scroll">
                <div class="migration-tree">
                  <div
                    class="migration-tree__node migration-tree__node--root"
                    @click="toggleExpanded('root')"
                  >
                    <i
                      class="migration-tree__expand codicon"
                      :class="isExpanded('root') ? 'codicon-chevron-down' : 'codicon-chevron-right'"
                      aria-hidden="true"
                    />
                    <i class="codicon codicon-database blue" aria-hidden="true" />
                    <span>{{ sourceInfo.find((item) => item.label === 'Database')?.value || source.database || '-' }}</span>
                  </div>
                  <div
                    v-if="isExpanded('root')"
                    class="migration-tree__children"
                  >
                    <div
                      class="migration-tree__node migration-tree__node--folder"
                      @click="toggleExpanded('tables')"
                    >
                      <i
                        class="migration-tree__expand codicon"
                        :class="isExpanded('tables') ? 'codicon-chevron-down' : 'codicon-chevron-right'"
                        aria-hidden="true"
                      />
                      <i class="codicon codicon-folder" aria-hidden="true" />
                      <span>Tables</span>
                    </div>
                    <div
                      v-if="isExpanded('tables')"
                      class="migration-tree__children"
                    >
                      <div
                        v-for="group in groups"
                        :key="`reference-${group.name}`"
                        class="migration-tree__node"
                        :class="{ 'migration-tree__node--active': activeTable === group.name }"
                        @click="activeTable = group.name"
                      >
                        <span class="migration-tree__indent" />
                        <i class="codicon codicon-table" aria-hidden="true" />
                        <span>{{ group.name }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="migration-tree-col">
              <div class="migration-tree-col__header">Target</div>
              <div class="migration-tree-col__conn">{{ connectionLabel(targetConnection) }}</div>
              <div class="migration-tree-col__scroll">
                <div class="migration-tree migration-tree--target">
                  <div
                    class="migration-tree__node migration-tree__node--root"
                    @click="toggleExpanded('root')"
                  >
                    <i
                      class="migration-tree__expand codicon"
                      :class="isExpanded('root') ? 'codicon-chevron-down' : 'codicon-chevron-right'"
                      aria-hidden="true"
                    />
                    <i class="codicon codicon-database orange" aria-hidden="true" />
                    <span>{{ targetInfo.find((item) => item.label === 'Database')?.value || target.database || '-' }}</span>
                  </div>
                  <div
                    v-if="isExpanded('root')"
                    class="migration-tree__children"
                  >
                    <div
                      class="migration-tree__node migration-tree__node--folder"
                      @click="toggleExpanded('tables')"
                    >
                      <i
                        class="migration-tree__expand codicon"
                        :class="isExpanded('tables') ? 'codicon-chevron-down' : 'codicon-chevron-right'"
                        aria-hidden="true"
                      />
                      <input
                        type="checkbox"
                        :checked="allSelected"
                        :indeterminate="partialSelection"
                        aria-label="Select all table changes"
                        @click.stop
                        @change="toggleAll(($event.target as HTMLInputElement).checked)"
                      >
                      <i class="codicon codicon-folder" aria-hidden="true" />
                      <span>Tables</span>
                    </div>
                    <div
                      v-if="isExpanded('tables')"
                      class="migration-tree__children"
                    >
                      <template
                        v-for="group in groups"
                        :key="`target-${group.name}`"
                      >
                        <div
                          class="migration-tree__node"
                          :class="[
                            { 'migration-tree__node--active': activeTable === group.name },
                            `migration-tree__node--${group.type}`,
                          ]"
                          @click="activeTable = group.name"
                        >
                          <i
                            v-if="groupHasDetails(group)"
                            class="migration-tree__expand codicon"
                            :class="isExpanded(`table:${group.name}`) ? 'codicon-chevron-down' : 'codicon-chevron-right'"
                            @click.stop="toggleExpanded(`table:${group.name}`)"
                            aria-hidden="true"
                          />
                          <span
                            v-else
                            class="migration-tree__indent"
                          />
                          <input
                            type="checkbox"
                            :checked="selectedGroup(group)"
                            :aria-label="`Select ${group.name}`"
                            @click.stop
                            @change="setTableSelected(group.name, ($event.target as HTMLInputElement).checked)"
                          >
                          <i class="codicon codicon-table" aria-hidden="true" />
                          <span>{{ group.name }}</span>
                          <span
                            v-if="group.type !== 'create' && group.type !== 'drop'"
                            class="type-tag"
                            :class="`type-tag--${group.type}`"
                          >{{ actionLabel(group.type) }}</span>
                        </div>
                        <div
                          v-if="isExpanded(`table:${group.name}`) && groupHasDetails(group)"
                          class="migration-tree__children"
                        >
                          <template v-if="groupHasColumns(group)">
                            <div
                              class="migration-tree__node migration-tree__node--folder"
                              @click="toggleExpanded(`table:${group.name}:columns`)"
                            >
                              <i
                                class="migration-tree__expand codicon"
                                :class="isExpanded(`table:${group.name}:columns`) ? 'codicon-chevron-down' : 'codicon-chevron-right'"
                                @click.stop="toggleExpanded(`table:${group.name}:columns`)"
                                aria-hidden="true"
                              />
                              <i class="codicon codicon-folder" aria-hidden="true" />
                              <span>Columns</span>
                            </div>
                            <div
                              v-if="isExpanded(`table:${group.name}:columns`) && group.columns.length"
                              class="migration-tree__children"
                            >
                              <div
                                v-for="column in group.columns"
                                :key="`${group.name}-${column.name}`"
                                class="migration-tree__node migration-tree__node--leaf"
                                :class="`migration-tree__node--${column.type}`"
                              >
                                <span class="migration-tree__indent" />
                                <i class="codicon codicon-symbol-field" aria-hidden="true" />
                                <span>{{ column.name }}</span>
                                <span
                                  v-if="column.detail"
                                  class="migration-tree__detail"
                                >{{ column.detail }}</span>
                              </div>
                            </div>
                          </template>
                          <template v-if="groupHasKeys(group)">
                            <div
                              class="migration-tree__node migration-tree__node--folder"
                              @click="toggleExpanded(`table:${group.name}:keys`)"
                            >
                              <i
                                class="migration-tree__expand codicon"
                                :class="isExpanded(`table:${group.name}:keys`) ? 'codicon-chevron-down' : 'codicon-chevron-right'"
                                @click.stop="toggleExpanded(`table:${group.name}:keys`)"
                                aria-hidden="true"
                              />
                              <i class="codicon codicon-folder" aria-hidden="true" />
                              <span>Keys</span>
                            </div>
                            <div
                              v-if="isExpanded(`table:${group.name}:keys`) && group.keys.length"
                              class="migration-tree__children"
                            >
                              <div
                                v-for="key in group.keys"
                                :key="`${group.name}-key-${key.name}`"
                                class="migration-tree__node migration-tree__node--leaf"
                                :class="`migration-tree__node--${key.type}`"
                              >
                                <span class="migration-tree__indent" />
                                <i class="codicon codicon-key" aria-hidden="true" />
                                <span>{{ key.name }}</span>
                                <span
                                  v-if="key.detail"
                                  class="migration-tree__detail"
                                >{{ key.detail }}</span>
                              </div>
                            </div>
                          </template>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="migration-detail">
            <div class="migration-detail__header">Script preview</div>
            <textarea
              class="migration-editor"
              :value="sqlPreview"
              readonly
              spellcheck="false"
            />
          </div>
        </div>
        <footer class="struct-diff-dialog__footer">
          <VscButton @click="closeResult">Cancel</VscButton>
          <VscButton
            :disabled="selectedItems.length === 0"
            @click="openQuery"
          >
            Open in Query Console
          </VscButton>
          <VscButton
            type="primary"
            :disabled="selectedItems.length === 0 || syncing"
            @click="sync"
          >
            {{ syncing ? "Executing…" : "Execute" }}
          </VscButton>
        </footer>
      </section>
    </div>
  </section>
</template>
