<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import {
  normalizeDesignColumn,
  type TableDesignColumn,
  type TableDesignForeignKey,
  type TableDesignIndex,
  type TableDesignMetadata,
} from "../../modern/database/tableDesign";
import UiInput from "./UiInput.vue";
import UiSelect from "./UiSelect.vue";

type DesignPanel = "ddl" | "column" | "index" | "foreignKey" | "check" | "trigger";

interface MutableDesignState {
  table: string;
  schema: string | null;
  dbType: string;
  engine: string;
  comment: string;
  collation: string;
  columns: TableDesignColumn[];
  primaryKey: string;
  indexes: TableDesignIndex[];
  foreignKeys: TableDesignForeignKey[];
  checks: Record<string, unknown>[];
  triggers: Record<string, unknown>[];
  ddl: string;
  isSupportCheck: boolean;
  supportForeignKey: boolean;
  supportIndex: boolean;
  supportTrigger: boolean;
  canAlterTable: boolean;
}

interface ColumnDraft {
  name: string;
  type: string;
  defaultValue: string;
  comment: string;
  isNotNull: boolean;
  unsigned: boolean;
  zerofill: boolean;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const design = reactive<MutableDesignState>({
  table: "",
  schema: null,
  dbType: "MySQL",
  engine: "",
  comment: "",
  collation: "",
  columns: [],
  primaryKey: "",
  indexes: [],
  foreignKeys: [],
  checks: [],
  triggers: [],
  ddl: "",
  isSupportCheck: true,
  supportForeignKey: true,
  supportIndex: true,
  supportTrigger: true,
  canAlterTable: true,
});
const activePanel = ref<DesignPanel>("column");
const status = ref("");
const error = ref("");
const originalTable = ref("");
const originalComment = ref("");
const originalCollation = ref("");
const columnDrafts = ref<Record<string, ColumnDraft>>({});
const newColumn = reactive<ColumnDraft>({
  name: "",
  type: "VARCHAR(255)",
  defaultValue: "",
  comment: "",
  isNotNull: false,
  unsigned: false,
  zerofill: false,
});
const indexForm = reactive({
  name: "",
  columns: "",
  type: "BTREE",
  unique: false,
});
const foreignKeyForm = reactive({
  name: "",
  column: "",
  refTable: "",
  refColumn: "",
  updateRule: "NO ACTION",
  deleteRule: "NO ACTION",
});
const checkClause = ref("");
const triggerSql = ref("");
const subscriptions: BridgeDisposable[] = [];
const designPanels: readonly DesignPanel[] = [
  "ddl",
  "column",
  "foreignKey",
  "index",
  "trigger",
  "check",
];
const designPanelLabels: Readonly<Record<DesignPanel, string>> = {
  ddl: "DDL",
  column: "Columns",
  foreignKey: "Foreign keys",
  index: "Indexes",
  trigger: "Triggers",
  check: "Checks",
};
const visibleDesignPanels = computed(() => designPanels.filter(
  (panel) => panel === "ddl"
    || panel === "column"
    || panel === "foreignKey" && design.supportForeignKey
    || panel === "index" && design.supportIndex
    || panel === "trigger" && design.supportTrigger
    || panel === "check" && design.isSupportCheck,
));

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function rowText(value: unknown, ...keys: string[]): string {
  const source = record(value);
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null)
      return text(source[key]);
    const matching = Object.keys(source).find(
      (name) => name.toLowerCase() === key.toLowerCase(),
    );
    if (matching) return text(source[matching]);
  }
  return "";
}

function bool(value: unknown): boolean {
  return typeof value === "boolean"
    ? value
    : ["1", "true", "yes", "y", "pri", "primary"].includes(
        text(value).toLowerCase(),
      );
}

function updateColumnDrafts(): void {
  const next: Record<string, ColumnDraft> = {};
  for (const column of design.columns) {
    next[column.name] = {
      name: column.name,
      type: text(column.type || column.simpleType || "TEXT"),
      defaultValue: text(column.defaultValue),
      comment: text(column.comment),
      isNotNull:
        column.isNotNull === true ||
        ["no", "false", "0"].includes(text(column.nullable).toLowerCase()),
      unsigned: text(column.extra).toLowerCase().includes("unsigned"),
      zerofill: text(column.extra).toLowerCase().includes("zerofill"),
    };
  }
  columnDrafts.value = next;
}

function applyDesignState(value: unknown): void {
  const source = record(value) as Partial<TableDesignMetadata>;
  if (typeof source.table === "string") {
    design.table = source.table;
    originalTable.value = source.table;
  }
  if (source.schema !== undefined)
    design.schema = source.schema == null ? null : text(source.schema);
  if (typeof source.dbType === "string") design.dbType = source.dbType;
  if (source.engine !== undefined) design.engine = text(source.engine);
  if (source.comment !== undefined) {
    design.comment = text(source.comment);
    originalComment.value = design.comment;
  }
  if (source.collation !== undefined) {
    design.collation = text(source.collation);
    originalCollation.value = design.collation;
  }
  design.columns = Array.isArray(source.columns)
    ? source.columns.map((column) => normalizeDesignColumn(column))
    : design.columns;
  if (source.primaryKey !== undefined)
    design.primaryKey = text(source.primaryKey);
  design.indexes = Array.isArray(source.indexes)
    ? source.indexes.map((item) => record(item) as TableDesignIndex)
    : design.indexes;
  design.foreignKeys = Array.isArray(source.foreignKeys)
    ? source.foreignKeys.map((item) => record(item) as TableDesignForeignKey)
    : design.foreignKeys;
  design.checks = Array.isArray(source.checks)
    ? source.checks.map((item) => record(item))
    : design.checks;
  design.triggers = Array.isArray(source.triggers)
    ? source.triggers.map((item) => record(item))
    : design.triggers;
  if (typeof source.ddl === "string") design.ddl = source.ddl;
  if (typeof source.isSupportCheck === "boolean")
    design.isSupportCheck = source.isSupportCheck;
  if (typeof source.supportForeignKey === "boolean")
    design.supportForeignKey = source.supportForeignKey;
  if (typeof source.supportIndex === "boolean")
    design.supportIndex = source.supportIndex;
  if (typeof source.supportTrigger === "boolean")
    design.supportTrigger = source.supportTrigger;
  if (typeof source.canAlterTable === "boolean")
    design.canAlterTable = source.canAlterTable;
  if (!visibleDesignPanels.value.includes(activePanel.value)) {
    activePanel.value = "column";
  }
  if (Array.isArray(source.columns)) updateColumnDrafts();
}

function emitRefresh(): void {
  bridge?.emit("refresh");
}

function updateTable(): void {
  bridge?.emit("updateTable", {
    table: originalTable.value || design.table,
    schema: design.schema,
    dbType: design.dbType,
    newTableName: design.table,
    comment: originalComment.value,
    newComment: design.comment,
    collation: originalCollation.value,
    newCollation: design.collation,
  });
}

function updateColumn(column: TableDesignColumn): void {
  const draft = columnDrafts.value[column.name];
  if (!draft) return;
  bridge?.emit("updateColumn", {
    ...draft,
    table: design.table,
    schema: design.schema,
    dbType: design.dbType,
    columnName: column.name,
    newColumnName: draft.name,
    columnType: draft.type,
    oldRow: column,
  });
}

function addColumn(): void {
  if (!newColumn.name.trim() || !newColumn.type.trim()) {
    error.value = "Column name and type are required.";
    return;
  }
  bridge?.emit("updateColumn", {
    ...newColumn,
    table: design.table,
    schema: design.schema,
    dbType: design.dbType,
    isNew: true,
    newColumnName: newColumn.name,
    columnType: newColumn.type,
  });
}

function createIndex(): void {
  const columns = indexForm.columns
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
  if (columns.length === 0) {
    error.value = "At least one index column is required.";
    return;
  }
  bridge?.emit("createIndex", {
    table: design.table,
    schema: design.schema,
    dbType: design.dbType,
    name: indexForm.name,
    columns,
    type: indexForm.type,
    unique: indexForm.unique,
  });
}

function dropIndex(item: TableDesignIndex): void {
  const name = rowText(item, "name", "indexName", "INDEX_NAME");
  if (name)
    bridge?.emit("dropIndex", {
      name,
      table: design.table,
      schema: design.schema,
      dbType: design.dbType,
    });
}

function createForeignKey(): void {
  if (
    !foreignKeyForm.column ||
    !foreignKeyForm.refTable ||
    !foreignKeyForm.refColumn
  ) {
    error.value =
      "Foreign-key column, table, and referenced column are required.";
    return;
  }
  bridge?.emit("createForeignKey", {
    ...foreignKeyForm,
    table: design.table,
    schema: design.schema,
    dbType: design.dbType,
  });
}

function dropForeignKey(item: TableDesignForeignKey): void {
  const name = rowText(item, "constraintName", "CONSTRAINT_NAME", "name");
  if (name)
    bridge?.emit("dropForeignKey", {
      name,
      table: design.table,
      schema: design.schema,
      dbType: design.dbType,
    });
}

function createCheck(): void {
  if (!checkClause.value.trim()) {
    error.value = "Check expression is required.";
    return;
  }
  bridge?.emit("createCheck", {
    table: design.table,
    schema: design.schema,
    dbType: design.dbType,
    clause: checkClause.value,
  });
}

function dropCheck(item: Record<string, unknown>): void {
  const name = rowText(item, "constraintName", "CONSTRAINT_NAME", "name");
  if (name)
    bridge?.emit("dropCheck", {
      name,
      table: design.table,
      schema: design.schema,
      dbType: design.dbType,
    });
}

function dropTrigger(item: Record<string, unknown>): void {
  const name = rowText(
    item,
    "name",
    "triggerName",
    "trigger_name",
    "TRIGGER_NAME",
  );
  if (name)
    bridge?.emit("dropTrigger", {
      name,
      table: design.table,
      schema: design.schema,
      dbType: design.dbType,
    });
}

async function copyDdl(): Promise<void> {
  if (!design.ddl) return;
  try {
    await navigator.clipboard.writeText(design.ddl);
    status.value = "DDL copied.";
  } catch {
    error.value = "Unable to copy DDL to the clipboard.";
  }
}

function dropColumn(column: TableDesignColumn): void {
  if (!design.canAlterTable || !window.confirm(`Drop column ${column.name}?`)) return;
  bridge?.emit("dropColumn", {
    name: column.name,
    table: design.table,
    schema: design.schema,
    dbType: design.dbType,
  });
}

onMounted(() => {
  applyDesignState(bootstrap.state);
  subscriptions.push(
    bridge?.on("designMetaNext", applyDesignState) || { dispose: () => undefined },
    bridge?.on("designMeta", applyDesignState) || { dispose: () => undefined },
    bridge?.on("design-data", applyDesignState) || { dispose: () => undefined },
    bridge?.on("ddl", (content) => {
      const source = record(content);
      if (typeof source.ddl === "string") design.ddl = source.ddl;
    }) || { dispose: () => undefined },
    bridge?.on("columns", (content) => {
      if (Array.isArray(content)) applyDesignState({ columns: content });
    }) || { dispose: () => undefined },
    bridge?.on("indexes", (content) => {
      if (Array.isArray(content)) applyDesignState({ indexes: content });
    }) || { dispose: () => undefined },
    bridge?.on("foreignKeys", (content) => {
      if (Array.isArray(content)) applyDesignState({ foreignKeys: content });
    }) || { dispose: () => undefined },
    bridge?.on("checks", (content) => {
      if (Array.isArray(content)) applyDesignState({ checks: content });
    }) || { dispose: () => undefined },
    bridge?.on("triggers", (content) => {
      if (Array.isArray(content)) applyDesignState({ triggers: content });
    }) || { dispose: () => undefined },
    bridge?.on("success", (content) => {
      status.value = `${text(content || "Operation")} updated successfully.`;
      error.value = "";
    }) || { dispose: () => undefined },
    bridge?.on("refresh_design", emitRefresh) || { dispose: () => undefined },
    bridge?.on("error", (content) => {
      error.value = text(content || "Design operation failed.");
      status.value = "";
    }) || { dispose: () => undefined },
  );
  bridge?.init("design");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <section class="route-workspace design-view" data-route="design">
    <header class="route-workspace__header">
      <div>
        <h1>Table Design</h1>
        <p class="route-workspace__subline">
          {{ design.schema ? `${design.schema}.` : "" }}{{ design.table }} ·
          {{ design.dbType }}
        </p>
      </div>
      <div class="route-workspace__actions">
        <VscButton type="default" @click="emitRefresh">
          Refresh
        </VscButton>
        <VscButton @click="updateTable"> Save table </VscButton>
      </div>
    </header>

    <section
      class="design-view__info-panel"
      data-region="info-panel"
    >
      <div class="design-view__info-row">
        <div class="design-view__info-field">
          <UiInput
            v-model="design.table"
            label="Table"
          />
        </div>
        <div class="design-view__info-field">
          <UiInput
            v-model="design.comment"
            label="Comment"
          />
        </div>
      </div>
      <div class="design-view__info-row">
        <div
          v-if="design.engine"
          class="design-view__info-field"
        >
          <UiInput
            :model-value="design.engine"
            label="Engine"
            disabled
          />
        </div>
        <div class="design-view__info-field">
          <UiInput
            v-model="design.collation"
            label="Collation"
          />
        </div>
        <VscButton
          type="primary"
          @click="updateTable"
        >
          Update
        </VscButton>
      </div>
    </section>

    <nav
      class="design-view__tabs"
      data-region="design-tabs"
    >
      <button
        v-for="panel in visibleDesignPanels"
        :key="panel"
        class="design-view__tab"
        :class="{ 'design-view__tab--active': activePanel === panel }"
        type="button"
        @click="activePanel = panel"
      >
        {{ designPanelLabels[panel] }}
      </button>
    </nav>

    <div v-if="error" class="route-workspace__error">
      {{ error }}
    </div>
    <p v-if="status" class="route-workspace__status">
      {{ status }}
    </p>

    <section
      v-if="activePanel === 'ddl'"
      class="design-view__panel"
      data-region="ddl-panel"
    >
      <textarea
        v-model="design.ddl"
        class="vsc-input design-view__editor"
        readonly
        spellcheck="false"
      />
      <div class="route-workspace__actions">
        <VscButton type="default" @click="copyDdl">
          Copy DDL
        </VscButton>
        <VscButton type="default" @click="bridge?.emit('ddl')">
          Reload DDL
        </VscButton>
      </div>
    </section>

    <section
      v-else-if="activePanel === 'column'"
      class="design-view__panel"
      data-region="column-panel"
    >
      <div class="route-workspace__table-wrap">
        <table class="route-workspace__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Default</th>
              <th>Comment</th>
              <th>Not null</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="column in design.columns" :key="column.name">
              <td><UiInput v-model="columnDrafts[column.name].name" /></td>
              <td><UiInput v-model="columnDrafts[column.name].type" /></td>
              <td>
                <UiInput v-model="columnDrafts[column.name].defaultValue" />
              </td>
              <td><UiInput v-model="columnDrafts[column.name].comment" /></td>
              <td>
                <input
                  v-model="columnDrafts[column.name].isNotNull"
                  type="checkbox"
                />
              </td>
              <td>
                <VscButton @click="updateColumn(column)"
                  >Update</VscButton
                >
                <VscButton
                  type="default"
                  :disabled="!design.canAlterTable"
                  @click="dropColumn(column)"
                >
                  Drop
                </VscButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="design-view__new-row">
        <UiInput v-model="newColumn.name" placeholder="New column" />
        <UiInput v-model="newColumn.type" placeholder="Type" />
        <UiInput v-model="newColumn.defaultValue" placeholder="Default" />
        <UiInput v-model="newColumn.comment" placeholder="Comment" />
        <VscButton @click="addColumn">Add column</VscButton>
      </div>
    </section>

    <section
      v-else-if="activePanel === 'index'"
      class="design-view__panel"
      data-region="index-panel"
    >
      <div class="route-workspace__table-wrap">
        <table class="route-workspace__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Columns</th>
              <th>Unique</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in design.indexes"
              :key="rowText(item, 'name', 'indexName', 'INDEX_NAME')"
            >
              <td>{{ rowText(item, "name", "indexName", "INDEX_NAME") }}</td>
              <td>
                {{ rowText(item, "columnName", "COLUMN_NAME", "columns") }}
              </td>
              <td>
                {{
                  bool(item.isUnique ?? item["NON_UNIQUE"] === 0) ? "Yes" : "No"
                }}
              </td>
              <td>
                <VscButton
                  type="default"
                  @click="dropIndex(item)"
                  >Drop</VscButton
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="design-view__new-row">
        <UiInput v-model="indexForm.name" placeholder="Index name" />
        <UiInput v-model="indexForm.columns" placeholder="column_a, column_b" />
        <UiSelect
          v-model="indexForm.type"
          :options="['BTREE', 'HASH', 'GIN', 'GIST', 'FULLTEXT', 'SPATIAL']"
        />
        <label class="vsc-field vsc-field--inline"
          ><input v-model="indexForm.unique" type="checkbox" /> Unique</label
        >
        <VscButton @click="createIndex">Create index</VscButton>
      </div>
    </section>

    <section
      v-else-if="activePanel === 'foreignKey'"
      class="design-view__panel"
      data-region="foreign-key-panel"
    >
      <ul class="design-view__list">
        <li
          v-for="item in design.foreignKeys"
          :key="rowText(item, 'constraintName', 'CONSTRAINT_NAME')"
        >
          {{ rowText(item, "constraintName", "CONSTRAINT_NAME") }}:
          {{ rowText(item, "columnName", "COLUMN_NAME") }} →
          {{ rowText(item, "referencedTable", "REFERENCED_TABLE_NAME") }}.{{
            rowText(item, "referencedColumn", "REFERENCED_COLUMN_NAME")
          }}
          <VscButton
            type="default"
            @click="dropForeignKey(item)"
            >Drop</VscButton
          >
        </li>
      </ul>
      <div class="design-view__new-row">
        <UiInput v-model="foreignKeyForm.name" placeholder="Constraint name" />
        <UiInput v-model="foreignKeyForm.column" placeholder="Column" />
        <UiInput
          v-model="foreignKeyForm.refTable"
          placeholder="Referenced table"
        />
        <UiInput
          v-model="foreignKeyForm.refColumn"
          placeholder="Referenced column"
        />
        <UiSelect
          v-model="foreignKeyForm.updateRule"
          :options="[
            'NO ACTION',
            'RESTRICT',
            'CASCADE',
            'SET NULL',
            'SET DEFAULT',
          ]"
        />
        <UiSelect
          v-model="foreignKeyForm.deleteRule"
          :options="[
            'NO ACTION',
            'RESTRICT',
            'CASCADE',
            'SET NULL',
            'SET DEFAULT',
          ]"
        />
        <VscButton @click="createForeignKey">Create FK</VscButton>
      </div>
    </section>

    <section
      v-else-if="activePanel === 'check'"
      class="design-view__panel"
      data-region="check-panel"
    >
      <ul class="design-view__list">
        <li v-for="(item, index) in design.checks" :key="index">
          {{
            rowText(
              item,
              "clause",
              "CHECK_CLAUSE",
              "definition",
              "DEFINITION",
            ) || JSON.stringify(item)
          }}
          <VscButton type="default" @click="dropCheck(item)"
            >Drop</VscButton
          >
        </li>
      </ul>
      <div v-if="design.isSupportCheck" class="design-view__new-row">
        <UiInput v-model="checkClause" placeholder="price > 0" />
        <VscButton @click="createCheck">Create check</VscButton>
      </div>
      <p v-else class="route-workspace__subline">
        This database does not expose target check editing.
      </p>
    </section>

    <section
      v-else
      class="design-view__panel"
      data-region="trigger-panel"
    >
      <ul class="design-view__list">
        <li v-for="(item, index) in design.triggers" :key="index">
          {{
            rowText(item, "name", "trigger_name", "TRIGGER_NAME") ||
            JSON.stringify(item)
          }}
          <VscButton type="default" @click="dropTrigger(item)"
            >Drop</VscButton
          >
        </li>
      </ul>
      <div class="design-view__new-row">
        <textarea
          v-model="triggerSql"
          class="vsc-input"
          placeholder="CREATE TRIGGER ..."
        />
        <VscButton
          @click="bridge?.emit('execute', { type: 'trigger', sql: triggerSql })"
          >Execute trigger SQL</VscButton
        >
      </div>
    </section>
  </section>
</template>
