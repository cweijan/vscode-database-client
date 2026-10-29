<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import {
  parseResultBinaryInput,
  resultBinaryBase64,
  resultBinaryFromHex,
  resultBinaryHex,
  resultIsBinaryValue,
  resultValueEditText,
  resultValueText,
  type ResultBinaryValue,
} from "../../modern/database/resultValues";
import UiInput from "./UiInput.vue";
import UiSelect from "./UiSelect.vue";
import HexViewer from "./HexViewer.vue";

interface ResultFilter {
  column: string;
  operator: string;
  value: string;
}

interface ResultPayload {
  title?: string;
  sql?: string;
  rows?: Record<string, unknown>[];
  fields?: Array<Record<string, unknown>>;
  affectedRows?: number;
  dirty?: boolean;
  readonly?: boolean;
  readOnly?: boolean;
  baseSql?: string;
  sourceSql?: string;
  pageNum?: number;
  pageSize?: number;
  total?: number;
  serverPaging?: boolean;
  dbType?: string;
  columnList?: Array<Record<string, unknown>>;
  primaryKey?: string;
  primaryKeyList?: Array<Record<string, unknown>>;
  tableCount?: number;
  filters?: ResultFilter[];
  table?: string;
  schema?: string | null;
  database?: string | null;
  error?: string;
  sort?: { column: string; descending: boolean };
}

interface CellSelection {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

interface DetailEditor {
  rowIndex: number;
  column: string;
  draft: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const payload = reactive<ResultPayload>({
  ...(bootstrap.state as ResultPayload),
});
let resultSubscription: BridgeDisposable | undefined;
let runSubscription: BridgeDisposable | undefined;
let dataSubscription: BridgeDisposable | undefined;
let dmlSubscription: BridgeDisposable | undefined;
let ddlSubscription: BridgeDisposable | undefined;
let messageBlockSubscription: BridgeDisposable | undefined;
let messageSubscription: BridgeDisposable | undefined;
let stateSubscription: BridgeDisposable | undefined;
let updateSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;
let hostErrorSubscription: BridgeDisposable | undefined;
let clearSaveSubscription: BridgeDisposable | undefined;
let pageSubscription: BridgeDisposable | undefined;
let countSubscription: BridgeDisposable | undefined;
let sortSubscription: BridgeDisposable | undefined;
let fileSubscription: BridgeDisposable | undefined;
let loadedFileSubscription: BridgeDisposable | undefined;
let importSubscription: BridgeDisposable | undefined;
let exportSubscription: BridgeDisposable | undefined;
const status = ref("");
const updateSql = ref("");
const search = ref("");
const sortState = ref<{ column: string; descending: boolean }>();
const editing = ref<{ displayIndex: number; rowIndex: number; column: string }>();
const draft = ref("");
const hiddenColumns = ref<string[]>([]);
const filterColumn = ref("");
const filterOperator = ref("=");
const filterValue = ref("");
const activeFilters = ref<ResultFilter[]>([]);
const columnFilterValues = ref<Record<string, string>>({});
const selectedRows = ref<number[]>([]);
const cellSelection = ref<CellSelection>();
const insertModel = ref<Record<string, unknown>>();
const pendingUpdates = ref<Record<string, { current: Record<string, unknown>; original: Record<string, unknown> }>>({});
const exportType = ref("XLSX");
const exportWithOutLimit = ref(false);
const exportSQL = ref(false);
const csvEncoding = ref("UTF8");
const csvDelimiter = ref("comma");
const importMode = ref("insert");
const skipPrimaryKey = ref(false);
const binaryPreview = ref<{ column: string; value: unknown }>();
const detailEditor = ref<DetailEditor>();
const showSqlPanel = ref(false);
const queryRunning = ref(false);
const autoRefresh = ref("-1");
let autoRefreshTimer: number | undefined;

const rows = computed(() => payload.rows ?? []);
const allColumns = computed(() => {
  const fieldNames = (payload.fields ?? [])
    .map((field) => String(field.name ?? field.columnName ?? ""))
    .filter(Boolean);
  return fieldNames.length > 0
    ? fieldNames
    : Object.keys(rows.value[0] ?? {});
});

const columns = computed(() => allColumns.value.filter((column) => !hiddenColumns.value.includes(column)));
const editColumns = computed(() => {
  const source = payload.columnList?.length ? payload.columnList : payload.fields;
  return (source ?? []).filter((field) => String(field.name ?? field.columnName ?? ""));
});

const filteredRows = computed(() => {
  const term = search.value.trim().toLowerCase();
  const filtered = term
    ? rows.value.filter((row) => JSON.stringify(row).toLowerCase().includes(term))
    : [...rows.value];
  const sorting = sortState.value;
  if (!sorting) return filtered;
  return filtered.sort((left, right) => {
    const leftValue = cell(left, sorting.column);
    const rightValue = cell(right, sorting.column);
    const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
    return sorting.descending ? -comparison : comparison;
  });
});

const pageSize = computed(() => Math.max(1, Number(payload.pageSize) || 100));
const pageNum = computed(() => Math.max(1, Number(payload.pageNum) || 1));
const pageCount = computed(() => Math.max(
  1,
  payload.total == null
    ? pageNum.value + (payload.serverPaging === true && rows.value.length >= pageSize.value ? 1 : 0)
    : Math.ceil(payload.total / pageSize.value),
));
const pageStart = computed(() => (pageNum.value - 1) * pageSize.value);
const pageRows = computed(() => payload.serverPaging === true
  ? filteredRows.value
  : filteredRows.value.slice(pageStart.value, pageStart.value + pageSize.value));

function applyResult(content: unknown): void {
  if (!content || typeof content !== "object") {
    return;
  }
  const incoming = record(content);
  Object.assign(payload, content as ResultPayload);
  if (Array.isArray(incoming.filters)) {
    const filters = payload.filters ?? [];
    activeFilters.value = filters.map((filter) => ({
      column: String(filter.column || ""),
      operator: String(filter.operator || "="),
      value: String(filter.value || ""),
    })).filter((filter) => filter.column && filter.value);
    columnFilterValues.value = Object.fromEntries(
      activeFilters.value.map((filter) => [filter.column, filter.value]),
    );
  } else if ("filters" in incoming) {
    activeFilters.value = [];
    columnFilterValues.value = {};
  }
  if ("sort" in incoming) {
    sortState.value = payload.sort
      ? { column: payload.sort.column, descending: payload.sort.descending === true }
      : undefined;
  }
  if (!filterColumn.value && allColumns.value.length > 0) {
    filterColumn.value = allColumns.value[0] || "";
  }
  hiddenColumns.value = hiddenColumns.value.filter((column) => allColumns.value.includes(column));
}

function applyRowsResult(content: unknown): void {
  const value = record(content);
  if (Array.isArray(value.data)) payload.rows = value.data as Record<string, unknown>[];
  if (typeof value.sql === "string") payload.sql = value.sql;
  payload.pageNum = 1;
  editing.value = undefined;
  cellSelection.value = undefined;
  selectedRows.value = [];
}

function messageText(content: unknown, fallback: string): string {
  const source = record(content);
  const message = source.message ?? source.error ?? content;
  return message == null || message === "" ? fallback : String(message);
}

function executeSql(): void {
  const sql = String(payload.sql || payload.baseSql || "").trim();
  if (!sql || queryRunning.value) return;
  queryRunning.value = true;
  bridge?.emit("executeSQL", { sql });
}

function stopExecute(): void {
  if (!queryRunning.value) return;
  bridge?.emit("stopExecute");
}

function clearAutoRefresh(): void {
  if (autoRefreshTimer !== undefined) {
    window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = undefined;
  }
}

function setAutoRefresh(value: string): void {
  clearAutoRefresh();
  autoRefresh.value = value;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  autoRefreshTimer = window.setInterval(() => {
    if (!queryRunning.value && payload.sql) bridge?.emit("refresh");
  }, seconds * 1_000);
}

function applyTargetExecution(content: unknown, kind: "RUN" | "DML" | "DDL" | "MESSAGE_BLOCK"): void {
  const source = record(content);
  if (typeof source.sql === "string") payload.sql = source.sql;
  if (typeof source.dbType === "string") payload.dbType = source.dbType;
  if (kind === "RUN") {
    payload.error = undefined;
    queryRunning.value = true;
    status.value = "Running…";
    return;
  }
  queryRunning.value = false;
  if (kind === "DML" || kind === "DDL") {
    if (Array.isArray(source.data) || Array.isArray(source.rows)) {
      applyResult({
        ...source,
        rows: Array.isArray(source.rows) ? source.rows : source.data,
      });
    } else {
      payload.rows = [];
      payload.error = undefined;
    }
  }
  status.value = messageText(content, kind === "MESSAGE_BLOCK" ? "Query completed." : "Update completed.");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cloneRow(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row };
}

function dataRowIndex(row: Record<string, unknown>, fallback: number): number {
  const index = payload.rows?.indexOf(row);
  return index != null && index >= 0 ? index : fallback;
}

function cell(row: Record<string, unknown>, column: string): string {
  return resultValueText(row[column]);
}

function columnMetadata(column: string): Record<string, unknown> {
  const source = payload.columnList?.length ? payload.columnList : payload.fields;
  const field = source?.find((item) => String(item.name ?? item.columnName ?? "") === column);
  return field && typeof field === "object" ? field : {};
}

function columnType(column: string): string {
  const field = columnMetadata(column);
  return String(field.simpleType ?? field.type ?? "").toLowerCase();
}

function editorInputType(column: string): "date" | "time" | "datetime-local" | undefined {
  const type = columnType(column);
  if (type === "date") return "date";
  if (type === "time") return "time";
  if (type.includes("datetime") || type.includes("timestamp")) return "datetime-local";
  return undefined;
}

function isJsonColumn(column: string): boolean {
  return /json|jsonb|object|array/i.test(columnType(column));
}

function isBinaryColumn(column: string): boolean {
  return /blob|byte|binary|bytea|raw|image|varbinary|bfile/i.test(columnType(column));
}

function valueForEdit(value: string, column: string): unknown {
  if (isBinaryColumn(column)) return parseResultBinaryInput(value);
  if (value.trim().toUpperCase() === "NULL") return null;
  if (isJsonColumn(column)) return JSON.parse(value);
  const type = columnType(column);
  if (editorInputType(column) === "datetime-local") return value.replace("T", " ");
  if (/^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real)/.test(type)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (/^(bool|boolean)$/.test(type)) {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return value;
}

function isComplexValue(value: unknown): boolean {
  const candidate = record(value);
  return candidate.type === "LongString"
    || candidate.type === "Binary"
    || candidate.type === "Image"
    || resultIsBinaryValue(value);
}

function detailIsBinary(editor: DetailEditor): boolean {
  return isBinaryColumn(editor.column) || resultIsBinaryValue(rows.value[editor.rowIndex]?.[editor.column]);
}

const readonly = computed(() => payload.readonly === true || payload.readOnly === true);
const canMutate = computed(() => !readonly.value && Boolean(payload.table) && editColumns.value.length > 0);
const hasPendingChanges = computed(() => payload.dirty || Object.keys(pendingUpdates.value).length > 0);
const canOpenErDiagram = computed(() => Boolean(payload.table));
const hasPrimaryKey = computed(() => Boolean(
  payload.primaryKey
  || (Array.isArray(payload.primaryKeyList) && payload.primaryKeyList.length > 0),
));
const aggregate = computed(() => {
  const selection = selectedCellBounds();
  if (!selection) return undefined;
  const values: number[] = [];
  for (let rowIndex = selection.startRow; rowIndex <= selection.endRow; rowIndex += 1) {
    const row = pageRows.value[rowIndex];
    if (!row) continue;
    for (let columnIndex = selection.startColumn; columnIndex <= selection.endColumn; columnIndex += 1) {
      const column = columns.value[columnIndex];
      if (!column) continue;
      const value = row[column];
      if (value == null || value === "") continue;
      const number = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(number)) values.push(number);
    }
  }
  if (values.length === 0) return undefined;
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    sum,
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
});

function startEdit(rowIndex: number, column: string): void {
  if (!canMutate.value) return;
  const row = pageRows.value[rowIndex];
  if (!row) return;
  const dataIndex = dataRowIndex(row, payload.serverPaging === true ? rowIndex : pageStart.value + rowIndex);
  editing.value = { displayIndex: rowIndex, rowIndex: dataIndex, column };
  const currentValue = resultValueEditText(row[column]);
  draft.value = editorInputType(column) === "datetime-local"
    ? currentValue.replace(" ", "T")
    : currentValue;
}

function cancelEdit(): void {
  editing.value = undefined;
  draft.value = "";
}

function saveCell(): void {
  const current = editing.value;
  if (!current) return;
  const selected = selectedCellTargets();
  const targets = selected.length > 1 && selected.some((target) =>
    target.rowIndex === current.rowIndex && target.column === current.column)
    ? selected
    : [{ rowIndex: current.rowIndex, column: current.column }];
  try {
    const updates = targets.map((target) => ({
      ...target,
      value: valueForEdit(draft.value, target.column),
    }));
    for (const update of updates) applyCellValue(update.rowIndex, update.column, update.value);
  } catch (error) {
    status.value = error instanceof Error ? error.message : "Invalid cell value.";
    return;
  }
  payload.dirty = true;
  cancelEdit();
}

function applyCellValue(rowIndex: number, column: string, value: unknown): void {
  const currentRows = rows.value;
  const row = record(currentRows[rowIndex]);
  const pending = pendingUpdates.value[String(rowIndex)];
  const original = pending?.original || cloneRow(row);
  row[column] = value;
  currentRows[rowIndex] = row;
  pendingUpdates.value[String(rowIndex)] = {
    current: cloneRow(row),
    original,
  };
  bridge?.emit("syncRow", { index: rowIndex, field: column, value });
}

function openValueDetail(row: Record<string, unknown>, displayIndex: number, column: string): void {
  const rowIndex = dataRowIndex(
    row,
    payload.serverPaging === true ? displayIndex : pageStart.value + displayIndex,
  );
  detailEditor.value = {
    rowIndex,
    column,
    draft: resultValueEditText(row[column]),
  };
}

function applyValueDetail(): void {
  const editor = detailEditor.value;
  if (!editor) return;
  if (readonly.value) {
    status.value = "The result is read-only.";
    return;
  }
  try {
    applyCellValue(editor.rowIndex, editor.column, valueForEdit(editor.draft, editor.column));
    payload.dirty = true;
    detailEditor.value = undefined;
  } catch (error) {
    status.value = error instanceof Error ? error.message : "Invalid cell value.";
  }
}

function loadDetailFile(): void {
  const editor = detailEditor.value;
  if (!editor) return;
  bridge?.emit("loadFile", { isBinary: detailIsBinary(editor) });
}

function exportDetailFile(): void {
  const editor = detailEditor.value;
  if (!editor) return;
  const binary = detailIsBinary(editor);
  let content: unknown = editor.draft;
  if (binary) {
    try {
      content = parseResultBinaryInput(editor.draft);
    } catch (error) {
      status.value = error instanceof Error ? error.message : "Invalid binary value.";
      return;
    }
  }
  bridge?.emit("exportFile", {
    column: { name: editor.column, type: columnType(editor.column) },
    content,
    isBinary: binary,
  });
}

function copyRows(): void {
  const currentRows = rows.value;
  const selected = selectedRows.value
    .map((index) => record(currentRows[index]))
    .filter((row) => Object.keys(row).length > 0);
  bridge?.emit("copyResult", {
    columns: columns.value,
    rows: selected.length > 0 ? selected : pageRows.value,
  });
}

function exportRows(exportToEditor = false): void {
  const currentRows = rows.value;
  const selected = selectedRows.value
    .map((index) => record(currentRows[index]))
    .filter((row) => Object.keys(row).length > 0);
  bridge?.emit("export", {
    fields: payload.fields,
    rows: selected.length > 0 ? selected : pageRows.value,
    type: exportType.value,
    withOutLimit: exportWithOutLimit.value,
    exportSQL: exportSQL.value,
    csvEncoding: csvEncoding.value,
    csvDelimiter: csvDelimiter.value,
    exportToEditor,
    sql: payload.sql,
    table: payload.table,
  });
}

function selectCell(rowIndex: number, columnIndex: number, event: MouseEvent): void {
  const current = cellSelection.value;
  if (!event.shiftKey || !current) {
    cellSelection.value = {
      startRow: rowIndex,
      endRow: rowIndex,
      startColumn: columnIndex,
      endColumn: columnIndex,
    };
    return;
  }
  cellSelection.value = {
    ...current,
    endRow: rowIndex,
    endColumn: columnIndex,
  };
}

function selectedCellBounds(): CellSelection | undefined {
  const selection = cellSelection.value;
  if (!selection) return undefined;
  return {
    startRow: Math.min(selection.startRow, selection.endRow),
    endRow: Math.max(selection.startRow, selection.endRow),
    startColumn: Math.min(selection.startColumn, selection.endColumn),
    endColumn: Math.max(selection.startColumn, selection.endColumn),
  };
}

function isCellSelected(rowIndex: number, columnIndex: number): boolean {
  const selection = selectedCellBounds();
  return selection !== undefined
    && rowIndex >= selection.startRow
    && rowIndex <= selection.endRow
    && columnIndex >= selection.startColumn
    && columnIndex <= selection.endColumn;
}

function selectedCellTargets(): Array<{ rowIndex: number; column: string }> {
  const selection = selectedCellBounds();
  if (!selection) return [];
  const targets: Array<{ rowIndex: number; column: string }> = [];
  for (let rowIndex = selection.startRow; rowIndex <= selection.endRow; rowIndex += 1) {
    const row = pageRows.value[rowIndex];
    if (!row) continue;
    const dataIndex = dataRowIndex(
      row,
      payload.serverPaging === true ? rowIndex : pageStart.value + rowIndex,
    );
    for (let columnIndex = selection.startColumn; columnIndex <= selection.endColumn; columnIndex += 1) {
      const column = columns.value[columnIndex];
      if (column) targets.push({ rowIndex: dataIndex, column });
    }
  }
  return targets;
}

function copyCellSelection(): void {
  const selection = selectedCellBounds();
  if (!selection) return;
  const selectedRowsForCopy = pageRows.value.slice(selection.startRow, selection.endRow + 1);
  const selectedColumns = columns.value.slice(selection.startColumn, selection.endColumn + 1);
  bridge?.emit("copyResult", { columns: selectedColumns, rows: selectedRowsForCopy });
}

function exportCellSelection(): void {
  const selection = selectedCellBounds();
  if (!selection) return;
  const selectedRowsForExport = pageRows.value.slice(selection.startRow, selection.endRow + 1);
  const selectedColumns = columns.value.slice(selection.startColumn, selection.endColumn + 1);
  const selectedFields = (payload.fields ?? []).filter((field) => {
    const name = String(field.name ?? field.columnName ?? "");
    return selectedColumns.includes(name);
  });
  bridge?.emit("export", {
    fields: selectedFields,
    rows: selectedRowsForExport,
    type: exportType.value,
    withOutLimit: false,
    exportSQL: exportSQL.value,
    csvEncoding: csvEncoding.value,
    csvDelimiter: csvDelimiter.value,
    sql: payload.sql,
    table: payload.table,
  });
}

function setSelectedCells(value: null | string): void {
  if (!canMutate.value) return;
  const targets = selectedCellTargets();
  if (targets.length === 0) return;
  const currentRows = rows.value;
  for (const target of targets) {
    const row = record(currentRows[target.rowIndex]);
    const pending = pendingUpdates.value[String(target.rowIndex)];
    const original = pending?.original || cloneRow(row);
    row[target.column] = value;
    currentRows[target.rowIndex] = row;
    pendingUpdates.value[String(target.rowIndex)] = {
      current: cloneRow(row),
      original,
    };
    bridge?.emit("syncRow", { index: target.rowIndex, field: target.column, value });
  }
  payload.dirty = true;
  cellSelection.value = undefined;
}

function exportCell(row: Record<string, unknown>, column: string): void {
  bridge?.emit("exportFile", {
    column: { name: column },
    content: row[column],
    isBinary: isBinaryColumn(column),
  });
}

function openBinaryPreview(row: Record<string, unknown>, column: string): void {
  if (!resultIsBinaryValue(row[column])) return;
  binaryPreview.value = { column, value: row[column] };
}

const binaryPreviewHex = computed(() =>
  binaryPreview.value ? resultBinaryHex(binaryPreview.value.value) : undefined,
);

function loadCellFile(row: Record<string, unknown>, displayIndex: number, column: string): void {
  const index = dataRowIndex(row, payload.serverPaging === true ? displayIndex : pageStart.value + displayIndex);
  bridge?.emit("loadFile", {
    index,
    name: column,
    isBinary: isBinaryColumn(column),
  });
}

function saveChanges(): void {
  const updates = Object.values(pendingUpdates.value);
  if (updates.length > 0) {
    bridge?.emit("saveModify", { updates });
    return;
  }
  const sql = updateSql.value.trim();
  if (!sql) {
    status.value = "Enter one update statement before saving.";
    return;
  }
  bridge?.emit("saveModify", { sql });
}

function toggleSort(column: string): void {
  const current = sortState.value;
  const next = current?.column === column
    ? { column, descending: !current.descending }
    : { column, descending: false };
  sortState.value = next;
  bridge?.emit("sort", next);
}

function changePage(delta: number): void {
  const next = Math.min(pageCount.value, Math.max(1, pageNum.value + delta));
  if (next === pageNum.value) return;
  payload.pageNum = next;
  cellSelection.value = undefined;
  if (payload.serverPaging === true) {
    bridge?.emit("next", { pageNum: next, pageSize: pageSize.value });
  }
}

function setPageSize(value: string): void {
  const next = Math.max(1, Number(value) || 100);
  payload.pageSize = next;
  payload.pageNum = 1;
  cellSelection.value = undefined;
  if (payload.serverPaging === true) {
    bridge?.emit("next", { pageNum: 1, pageSize: next });
  }
}

function toggleColumn(column: string): void {
  hiddenColumns.value = hiddenColumns.value.includes(column)
    ? hiddenColumns.value.filter((item) => item !== column)
    : [...hiddenColumns.value, column];
}

function toggleRow(row: Record<string, unknown>, displayIndex: number): void {
  const index = dataRowIndex(row, payload.serverPaging === true ? displayIndex : pageStart.value + displayIndex);
  selectedRows.value = selectedRows.value.includes(index)
    ? selectedRows.value.filter((item) => item !== index)
    : [...selectedRows.value, index];
}

function selected(row: Record<string, unknown>, displayIndex: number): boolean {
  return selectedRows.value.includes(dataRowIndex(row, payload.serverPaging === true ? displayIndex : pageStart.value + displayIndex));
}

function selectAllVisible(checked: boolean): void {
  const visible = pageRows.value.map((row, index) => dataRowIndex(row, pageStart.value + index));
  selectedRows.value = checked
    ? [...new Set([...selectedRows.value, ...visible])]
    : selectedRows.value.filter((index) => !visible.includes(index));
}

function openInsert(): void {
  if (!canMutate.value) return;
  insertModel.value = Object.fromEntries(
    editColumns.value.map((field) => [String(field.name ?? field.columnName), ""]),
  );
}

function submitInsert(): void {
  if (!insertModel.value) return;
  bridge?.emit("saveModify", { inserts: [insertModel.value] });
  insertModel.value = undefined;
}

function importRows(): void {
  if (canMutate.value) {
    bridge?.emit("import", {
      mode: importMode.value,
      skipPrimaryKey: skipPrimaryKey.value,
      csvEncoding: csvEncoding.value,
      csvDelimiter: csvDelimiter.value,
    });
  }
}

function setInsertValue(name: string, value: string): void {
  if (insertModel.value) insertModel.value[name] = value;
}

function deleteSelected(): void {
  if (!canMutate.value || selectedRows.value.length === 0) return;
  if (!window.confirm(`Delete ${selectedRows.value.length} selected row(s)?`)) return;
  const currentRows = rows.value;
  bridge?.emit("saveModify", {
    deletes: selectedRows.value.map((index) => record(currentRows[index])),
  });
}

function updateActiveFilter(column: string, operator: string, value: string): void {
  const normalizedColumn = column.trim();
  const normalizedValue = value.trim();
  const current = activeFilters.value.filter(
    (filter) => filter.column.toLowerCase() !== normalizedColumn.toLowerCase(),
  );
  activeFilters.value = normalizedValue
    ? [...current, { column: normalizedColumn, operator, value: normalizedValue }]
    : current;
  bridge?.emit("filterResult", { filters: activeFilters.value });
}

function applyFilter(clear = false): void {
  if (clear) {
    activeFilters.value = [];
    columnFilterValues.value = {};
    filterValue.value = "";
    bridge?.emit("filterResult", { clear: true, filters: [] });
    return;
  }
  if (!filterColumn.value) return;
  updateActiveFilter(filterColumn.value, filterOperator.value, filterValue.value);
}

function setColumnFilterValue(column: string, value: string): void {
  columnFilterValues.value = { ...columnFilterValues.value, [column]: value };
}

function applyColumnFilter(column: string): void {
  updateActiveFilter(column, "=", columnFilterValues.value[column] || "");
}

function clearColumnFilter(column: string): void {
  setColumnFilterValue(column, "");
  updateActiveFilter(column, "=", "");
}

onMounted(() => {
  resultSubscription = bridge?.on("result", (content) => {
    queryRunning.value = false;
    applyResult(content);
  });
  runSubscription = bridge?.on("RUN", (content) => {
    applyTargetExecution(content, "RUN");
  });
  stateSubscription = bridge?.on("setState", (content) => {
    queryRunning.value = false;
    applyResult(content);
  });
  updateSubscription = bridge?.on("updateSuccess", (content) => {
    queryRunning.value = false;
    payload.dirty = false;
    pendingUpdates.value = {};
    selectedRows.value = [];
    status.value = messageText(content, "Update completed.");
    bridge?.emit("refresh");
  });
  errorSubscription = bridge?.on("ERROR", (content) => {
    queryRunning.value = false;
    payload.error = messageText(content, "Update failed.");
    status.value = messageText(content, "Update failed.");
  });
  dmlSubscription = bridge?.on("DML", (content) => {
    applyTargetExecution(content, "DML");
  });
  ddlSubscription = bridge?.on("DDL", (content) => {
    applyTargetExecution(content, "DDL");
  });
  messageBlockSubscription = bridge?.on("MESSAGE_BLOCK", (content) => {
    applyTargetExecution(content, "MESSAGE_BLOCK");
  });
  messageSubscription = bridge?.on("MESSAGE", (content) => {
    const source = record(content);
    queryRunning.value = false;
    status.value = messageText(content, "Operation completed.");
    if (source.success !== false) bridge?.emit("refresh");
  });
  hostErrorSubscription = bridge?.on("error", (content) => {
    queryRunning.value = false;
    payload.error = messageText(content, "Result request failed.");
    status.value = messageText(content, "Result request failed.");
  });
  clearSaveSubscription = bridge?.on("clearSaveState", () => {
    payload.dirty = false;
  });
  pageSubscription = bridge?.on("NEXT_PAGE", (content) => {
    queryRunning.value = false;
    const value = record(content);
    payload.rows = Array.isArray(value.data) ? value.data as Record<string, unknown>[] : [];
    payload.sql = typeof value.sql === "string" ? value.sql : payload.sql;
    payload.pageNum = Number(value.pageNum) || payload.pageNum || 1;
    payload.pageSize = Number(value.pageSize) || payload.pageSize || 100;
    editing.value = undefined;
    cellSelection.value = undefined;
    selectedRows.value = [];
    status.value = typeof value.costTime === "number" ? `Loaded in ${value.costTime} ms.` : "";
  });
  countSubscription = bridge?.on("COUNT", (content) => {
    const value = record(content).data ?? content;
    const total = Number(value);
    if (Number.isFinite(total) && total >= 0) payload.total = Math.floor(total);
  });
  dataSubscription = bridge?.on("DATA", (content) => {
    queryRunning.value = false;
    applyResult(content);
  });
  sortSubscription = bridge?.on("sort_result", (content) => {
    queryRunning.value = false;
    applyRowsResult(content);
  });
  fileSubscription = bridge?.on("fileContent", (content) => {
    const editor = detailEditor.value;
    if (!editor) {
      status.value = `Loaded ${String(content ?? "").length} character(s) from file.`;
      return;
    }
    const binary = detailIsBinary(editor);
    if (binary) {
      const base64 = resultBinaryBase64(content)
        || (typeof content === "string" ? resultBinaryFromHex(content)?.base64 : undefined)
        || String(content ?? "");
      editor.draft = `base64:${base64}`;
    } else {
      editor.draft = String(content ?? "");
    }
    status.value = `Loaded ${String(content ?? "").length} character(s) from file.`;
  });
  loadedFileSubscription = bridge?.on("loadFile", (content) => {
    const value = record(content);
    const index = Number(value.index);
    const name = String(value.name || "");
    const currentRows = rows.value;
    if (!Number.isInteger(index) || index < 0 || !name || index >= currentRows.length) return;
    const row = record(currentRows[index]);
    const original = pendingUpdates.value[String(index)]?.original || cloneRow(row);
    const binary = value.isBinary === true
      || isBinaryColumn(name)
      || resultIsBinaryValue(row[name]);
    const base64 = resultBinaryBase64(value.content)
      || (typeof value.content === "string" ? resultBinaryFromHex(value.content)?.base64 : undefined)
      || String(value.content ?? "");
    const loaded = binary
      ? ({ kind: "binary", base64 } satisfies ResultBinaryValue)
      : value.content;
    row[name] = loaded;
    currentRows[index] = row;
    pendingUpdates.value[String(index)] = { current: cloneRow(row), original };
    payload.dirty = true;
    bridge?.emit("syncRow", { index, field: name, value: loaded });
  });
  importSubscription = bridge?.on("import_done", (content) => {
    queryRunning.value = false;
    const value = record(content);
    status.value = value.success === false
      ? "Import failed."
      : `Imported ${String(value.count || 0)} row(s).`;
    if (value.success !== false) bridge?.emit("refresh");
  });
  exportSubscription = bridge?.on("export_done", (content) => {
    const value = record(content);
    status.value = value.success === false ? "Export cancelled or failed." : "Export completed.";
  });
  bridge?.emit("route-result");
  bridge?.emit("count", { sql: payload.baseSql || payload.sql });
});

onBeforeUnmount(() => {
  clearAutoRefresh();
  resultSubscription?.dispose();
  runSubscription?.dispose();
  dmlSubscription?.dispose();
  ddlSubscription?.dispose();
  messageBlockSubscription?.dispose();
  messageSubscription?.dispose();
  stateSubscription?.dispose();
  updateSubscription?.dispose();
  errorSubscription?.dispose();
  hostErrorSubscription?.dispose();
  clearSaveSubscription?.dispose();
  pageSubscription?.dispose();
  countSubscription?.dispose();
  dataSubscription?.dispose();
  sortSubscription?.dispose();
  fileSubscription?.dispose();
  loadedFileSubscription?.dispose();
  importSubscription?.dispose();
  exportSubscription?.dispose();
});
</script>

<template>
  <section
    class="data-viewer result-view"
    data-route="result"
  >
    <div
      id="toolbar-panel"
      class="hint result-view__target-panel"
    >
      <div class="toolbar result-view__target-toolbar">
        <button
          class="result-toolbar__icon"
          type="button"
          title="Pin"
          aria-label="Pin result"
          @click="bridge?.emit('pin')"
        >
          <i class="codicon codicon-pin" aria-hidden="true" />
        </button>
        <UiInput
          v-model="search"
          class="result-view__search-field"
          placeholder="Search result"
        />
        <button
          class="result-toolbar__icon"
          type="button"
          title="SQL panel"
          aria-label="Toggle SQL panel"
          @click="bridge?.emit('openConsole')"
        >
          <i class="codicon codicon-settings-gear" aria-hidden="true" />
        </button>
        <button
          class="result-toolbar__icon"
          type="button"
          title="Copy result"
          aria-label="Copy result"
          @click="copyRows"
        >
          <i class="codicon codicon-copy" aria-hidden="true" />
        </button>
        <button
          class="result-toolbar__icon"
          type="button"
          title="Copy selected cells"
          aria-label="Copy selected cells"
          :disabled="!cellSelection"
          @click="copyCellSelection"
        >
          <i class="codicon codicon-clippy" aria-hidden="true" />
        </button>
        <button
          class="result-toolbar__icon"
          type="button"
          title="View SQL history"
          aria-label="View SQL history"
          @click="bridge?.emit('viewHistory')"
        >
          <i class="codicon codicon-history" aria-hidden="true" />
        </button>
        <button
          class="result-toolbar__icon"
          type="button"
          title="View JSON"
          aria-label="View JSON"
          @click="bridge?.emit('viewJSON')"
        >
          <i class="codicon codicon-json" aria-hidden="true" />
        </button>
        <button
          class="result-toolbar__icon"
          type="button"
          title="Insert row"
          aria-label="Insert row"
          :disabled="!canMutate"
          @click="openInsert"
        >
          <i class="codicon codicon-add text-cyan" aria-hidden="true" />
        </button>
        <button
          class="result-toolbar__icon"
          type="button"
          title="Delete selected rows"
          aria-label="Delete selected rows"
          :disabled="!canMutate || selectedRows.length === 0"
          @click="deleteSelected"
        >
          <i class="codicon codicon-trash red" aria-hidden="true" />
        </button>
        <button
          class="result-toolbar__icon"
          type="button"
          title="Import data"
          aria-label="Import data"
          :disabled="!canMutate"
          @click="importRows"
        >
          <i class="codicon codicon-arrow-up yellow" aria-hidden="true" />
        </button>
        <button
          class="result-toolbar__icon"
          type="button"
          title="Export data"
          aria-label="Export data"
          :disabled="pageRows.length === 0"
          @click="exportRows()"
        >
          <i class="codicon codicon-arrow-down blue" aria-hidden="true" />
        </button>
        <button
          v-if="hasPendingChanges"
          class="result-toolbar__icon"
          type="button"
          title="Save changes"
          aria-label="Save changes"
          @click="saveChanges"
        >
          <i class="codicon codicon-check green" aria-hidden="true" />
        </button>
        <button
          v-if="!queryRunning"
          class="result-toolbar__icon"
          type="button"
          title="Execute SQL"
          aria-label="Execute SQL"
          :disabled="!payload.sql && !payload.baseSql"
          @click="executeSql"
        >
          <i class="codicon codicon-play green" aria-hidden="true" />
        </button>
        <button
          v-else
          class="result-toolbar__icon"
          type="button"
          title="Stop execute"
          aria-label="Stop execute"
          @click="stopExecute"
        >
          <i class="codicon codicon-debug-stop red" aria-hidden="true" />
        </button>
        <button
          class="result-toolbar__icon"
          type="button"
          title="Refresh result"
          aria-label="Refresh result"
          :disabled="!payload.sql"
          @click="bridge?.emit('refresh')"
        >
          <i class="codicon codicon-refresh" aria-hidden="true" />
        </button>
        <UiSelect
          :model-value="autoRefresh"
          label="Auto refresh"
          :options="[
            { value: '-1', label: 'None' },
            { value: '1', label: '1s' },
            { value: '3', label: '3s' },
            { value: '5', label: '5s' },
            { value: '30', label: '30s' },
            { value: '60', label: '1m' },
            { value: '300', label: '5m' },
          ]"
          @update:model-value="setAutoRefresh"
        />
        <span class="el-pagination__total">
          {{ payload.total ?? filteredRows.length }} row(s)
        </span>
        <div class="result-view__toolbar-pagination">
          <VscButton
            type="default"
            :disabled="pageNum <= 1"
            title="Previous page"
            @click="changePage(-1)"
          >
            ‹
          </VscButton>
          <span>Page {{ pageNum }} / {{ pageCount }}</span>
          <VscButton
            type="default"
            :disabled="pageNum >= pageCount"
            title="Next page"
            @click="changePage(1)"
          >
            ›
          </VscButton>
        </div>
      </div>
    </div>

    <div
      v-if="payload.error || status"
      class="info-panel"
      :class="{ 'info-panel-error': payload.error }"
      role="status"
    >
      {{ payload.error || status }}
    </div>
    <div
      v-if="payload.table && canMutate && payload.tableCount === 1 && !hasPrimaryKey"
      class="hint result-view__primary-key-warning"
    >
      <i class="codicon codicon-warning" aria-hidden="true" />
      No primary key found for <span class="red">{{ payload.table }}</span>; edits may affect multiple rows.
    </div>

    <div class="result-view__option-groups toolbar-config">
      <details class="result-view__options toolbar-config__section">
        <summary>Export options</summary>
        <UiSelect
          v-model="exportType"
          label="Format"
          :options="['XLSX', 'CSV', 'JSON', 'SQL', 'Markdown']"
        />
        <label class="result-view__option">
          <input
            v-model="exportWithOutLimit"
            type="checkbox"
          >
          Export without result limit
        </label>
        <label class="result-view__option">
          <input
            v-model="exportSQL"
            type="checkbox"
            :disabled="exportType !== 'XLSX'"
          >
          Add query sheet to XLSX
        </label>
        <UiSelect
          v-model="csvEncoding"
          label="CSV encoding"
          :options="['UTF8', 'GBK']"
        />
        <UiSelect
          v-model="csvDelimiter"
          label="CSV delimiter"
          :options="['comma', 'tab', 'semicolon', 'space']"
        />
        <VscButton
          type="default"
          :disabled="exportType === 'XLSX'"
          @click="exportRows(true)"
        >
          Open in editor
        </VscButton>
      </details>
      <details class="result-view__options toolbar-config__section">
        <summary>Import options</summary>
        <UiSelect
          v-model="importMode"
          label="Import mode"
          :options="['insert', 'upsert']"
        />
        <label class="result-view__option">
          <input
            v-model="skipPrimaryKey"
            type="checkbox"
            :disabled="importMode === 'upsert'"
          >
          Skip primary-key columns on insert
        </label>
      </details>
    </div>

    <div class="result-view__toolbar result-view__filter-toolbar">
      <UiSelect
        v-model="filterColumn"
        label="Filter column"
        :options="allColumns"
      />
      <UiSelect
        v-model="filterOperator"
        label="Operator"
        :options="['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE', 'IS', 'IS NOT']"
      />
      <UiInput
        v-model="filterValue"
        label="Filter value"
        placeholder="Value or NULL"
      />
      <VscButton
        type="default"
        @click="applyFilter()"
      >
        Apply filter
      </VscButton>
      <VscButton
        type="default"
        @click="applyFilter(true)"
      >
        Clear filter
      </VscButton>
      <UiSelect
        :model-value="String(pageSize)"
        label="Page size"
        :options="['25', '50', '100', '250']"
        @update:model-value="setPageSize"
      />
    </div>
    <div
      v-if="activeFilters.length > 0"
      class="result-view__filters"
    >
      <span
        v-for="filter in activeFilters"
        :key="filter.column + '-' + filter.operator"
        class="result-view__filter-chip"
      >
        {{ filter.column }} {{ filter.operator }} {{ filter.value }}
        <button
          type="button"
          title="Clear this filter"
          @click="clearColumnFilter(filter.column)"
        >
          ×
        </button>
      </span>
    </div>
    <details class="result-view__columns column-config-dialog toolbar-config__section">
      <summary>Visible columns</summary>
      <label
        v-for="column in allColumns"
        :key="column"
        class="result-view__column-toggle"
      >
        <input
          type="checkbox"
          :checked="!hiddenColumns.includes(column)"
          @change="toggleColumn(column)"
        >
        {{ column }}
      </label>
    </details>
    <div
      v-if="insertModel"
      class="result-view__insert"
    >
      <strong>New row</strong>
      <UiInput
        v-for="field in editColumns"
        :key="String(field.name ?? field.columnName)"
        :model-value="String(insertModel[String(field.name ?? field.columnName)] ?? '')"
        :label="String(field.name ?? field.columnName)"
        @update:model-value="setInsertValue(String(field.name ?? field.columnName), $event)"
      />
      <VscButton
        type="primary"
        @click="submitInsert"
      >
        Insert
      </VscButton>
      <VscButton
        type="default"
        @click="insertModel = undefined"
      >
        Cancel
      </VscButton>
    </div>
    <div
      v-if="showSqlPanel"
      class="panel-container sql-pannel"
    >
      <label class="inline-block mr-10 w-full">
        <span class="common_input_label">
          Update SQL (optional; used by Save changes)
        </span>
        <textarea
          v-model="updateSql"
          class="console-view__editor"
          :disabled="readonly"
          placeholder="UPDATE table_name SET column_name = value WHERE id = ..."
        />
      </label>
    </div>
    <div class="route-workspace__actions">
      <VscButton
        :disabled="readonly || !hasPendingChanges"
        @click="saveChanges"
      >
        Save changes
      </VscButton>
      <span class="route-workspace__subline">
        {{ hasPendingChanges ? "Unsaved row edits" : "No unsaved row edits" }}
      </span>
    </div>
    <p
      v-if="!payload.error && pageRows.length === 0"
      class="route-workspace__empty"
    >
      No rows returned{{ payload.affectedRows == null ? "" : `; affected ${payload.affectedRows} row(s)` }}.
    </p>
    <section
      v-if="detailEditor"
      class="result-view__detail"
    >
      <div class="result-view__binary-preview-header">
        <strong>{{ detailEditor.column }}</strong>
        <span class="route-workspace__subline">
          {{ detailIsBinary(detailEditor) ? "Binary values use base64:..." : "Full value editor" }}
        </span>
      </div>
      <textarea
        v-model="detailEditor.draft"
        class="console-view__editor result-view__detail-editor"
        :readonly="readonly"
      />
      <div class="route-workspace__actions">
        <VscButton
          type="default"
          @click="loadDetailFile"
        >
          Load file
        </VscButton>
        <VscButton
          type="default"
          @click="exportDetailFile"
        >
          Export value
        </VscButton>
        <VscButton
          :disabled="readonly"
          @click="applyValueDetail"
        >
          Apply value
        </VscButton>
        <VscButton
          type="default"
          @click="detailEditor = undefined"
        >
          Close
        </VscButton>
      </div>
    </section>
    <section
      v-if="binaryPreview && binaryPreviewHex"
      class="result-view__binary-preview"
    >
      <div class="result-view__binary-preview-header">
        <strong>{{ binaryPreview.column }}</strong>
        <VscButton
          type="default"
          @click="binaryPreview = undefined"
        >
          Close preview
        </VscButton>
      </div>
      <HexViewer :hex-data="binaryPreviewHex" />
    </section>
    <div
      v-else-if="!payload.error"
      class="result-view__table-wrap umy-table-body-viewport-container"
    >
      <table class="result-view__table umy-table umy-table-bordered umy-table-auto-height">
        <thead class="umy-table-header">
          <tr class="umy-table-row">
            <th class="umy-table-selection-column col--checkbox">
              <input
                type="checkbox"
                :checked="pageRows.length > 0 && pageRows.every((row, index) => selected(row, index))"
                @change="selectAllVisible(($event.target as HTMLInputElement).checked)"
              >
            </th>
            <th
              v-for="column in columns"
              :key="column"
              class="result-view__sortable umy-table-header-cell umy-table-column-has-sorters"
              @click="toggleSort(column)"
            >
              <span class="umy-table-column-title">{{ column }}</span>
              <span v-if="sortState?.column === column">
                {{ sortState.descending ? " ↓" : " ↑" }}
              </span>
            </th>
            <th class="umy-table-header-cell">Actions</th>
          </tr>
          <tr class="result-view__filter-row umy-table-row umy-table-filter-dropdown">
            <th />
            <th
              v-for="column in columns"
              :key="column"
            >
              <input
                class="field__input"
                :value="columnFilterValues[column] || ''"
                :placeholder="'Filter ' + column"
                @input="setColumnFilterValue(column, ($event.target as HTMLInputElement).value)"
                @keyup.enter="applyColumnFilter(column)"
              >
            </th>
            <th />
          </tr>
        </thead>
        <tbody class="umy-table-body">
          <tr
            v-for="(row, rowIndex) in pageRows"
            :key="`${pageNum}-${rowIndex}`"
            class="umy-table-row"
          >
            <td class="umy-table-cell umy-table-selection-column">
              <input
                type="checkbox"
                :checked="selected(row, rowIndex)"
                @change="toggleRow(row, rowIndex)"
              >
            </td>
            <td
              v-for="(column, columnIndex) in columns"
              :key="column"
              class="umy-table-cell umy-table-cell-content"
              title="Double-click to edit"
              :class="{ 'result-view__cell--selected': isCellSelected(rowIndex, columnIndex) }"
              @click="selectCell(rowIndex, columnIndex, $event)"
              @dblclick="startEdit(rowIndex, column)"
            >
              <template v-if="editing?.displayIndex === rowIndex && editing.column === column">
                <input
                  v-model="draft"
                  class="field__input"
                  :type="editorInputType(column) ?? 'text'"
                  @keyup.enter="saveCell"
                  @keyup.esc="cancelEdit"
                >
              </template>
              <template v-else>
                <span class="result-view__cell-value">
                  {{ cell(row, column) }}
                  <button
                    v-if="resultIsBinaryValue(row[column])"
                    type="button"
                    class="result-view__binary-button"
                    @click.stop="openBinaryPreview(row, column)"
                  >
                    View hex
                  </button>
                  <button
                    v-if="isComplexValue(row[column])"
                    type="button"
                    class="result-view__binary-button"
                    @click.stop="openValueDetail(row, rowIndex, column)"
                  >
                    Open value
                  </button>
                </span>
              </template>
            </td>
            <td class="umy-table-cell umy-table-cell-content">
              <VscButton
                type="default"
                :disabled="!canMutate"
                @click="startEdit(rowIndex, columns[0] || '')"
              >
                Edit first cell
              </VscButton>
              <VscButton
                type="default"
                :disabled="columns.length === 0"
                @click="openValueDetail(row, rowIndex, columns[0] || '')"
              >
                Open first cell
              </VscButton>
              <VscButton
                type="default"
                @click="exportCell(row, columns[0] || '')"
              >
                Export first cell
              </VscButton>
              <VscButton
                type="default"
                :disabled="!canMutate || !isBinaryColumn(columns[0] || '')"
                @click="loadCellFile(row, rowIndex, columns[0] || '')"
              >
                Load first cell
              </VscButton>
              <VscButton
                v-if="editing?.displayIndex === rowIndex"
                @click="saveCell"
              >
                Apply
              </VscButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="aggregate"
      class="status-bar fixed bottom-2 flex z-10 opacity-95"
    >
      <div><span class="status-bar-label">Count:</span> {{ aggregate.count }}</div>
      <div><span class="status-bar-label">Sum:</span> {{ aggregate.sum }}</div>
      <div><span class="status-bar-label">Avg:</span> {{ aggregate.avg }}</div>
      <div><span class="status-bar-label">Min:</span> {{ aggregate.min }}</div>
      <div><span class="status-bar-label">Max:</span> {{ aggregate.max }}</div>
    </div>
  </section>
</template>
