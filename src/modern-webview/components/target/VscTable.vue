<script setup lang="ts">
import { ElCheckbox } from "element-plus";
import {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  useSlots,
  watch,
  type PropType,
} from "vue";

import VscTableColumn from "./VscTableColumn.vue";
import {
  TABLE_CONTEXT,
  type CheckboxValue,
  type TableCellScope,
  type TableColumn,
} from "./tableContext";

type Row = Record<string, unknown>;

const MIN_COLUMN_WIDTH = 80;
const WRAP_PADDING = 20;

const props = withDefaults(
  defineProps<{
    columns?: TableColumn[];
    data?: Row[];
    rowKey?: string | ((row: Row) => unknown);
    height?: number | string;
    fitContent?: boolean;
    emptyIcon?: string;
    emptyText?: string;
    loading?: boolean;
    reserveSelection?: boolean;
    highlightCurrentRow?: boolean;
    currentRowKey?: string | number;
  }>(),
  {
    columns: undefined,
    data: () => [],
    rowKey: "id",
    height: undefined,
    fitContent: false,
    emptyIcon: "codicon-inbox",
    emptyText: "",
    loading: false,
    reserveSelection: false,
    highlightCurrentRow: false,
    currentRowKey: undefined,
  },
);

const emit = defineEmits<{
  "selection-change": [rows: Row[]];
  "row-click": [row: Row, event: MouseEvent];
  "row-dblclick": [row: Row, event: MouseEvent];
}>();

const TableRender = defineComponent({
  props: {
    render: { type: Function as PropType<(scope: TableCellScope) => unknown>, required: true },
    scope: { type: Object as PropType<TableCellScope>, required: true },
  },
  setup(renderProps) {
    return () => renderProps.render(renderProps.scope);
  },
});

const slots = useSlots();
const registeredColumns = ref(new Map<string, TableColumn>());
const declaredColumnIds = ref<string[]>([]);
const columnCacheVersion = ref(0);
const selectedKeys = ref(new Set<unknown>());
const sortProp = ref<string | null>(null);
const sortOrder = ref<"asc" | "desc">("asc");
const columnWidths = ref<Record<string, number>>({});
const resizing = ref<{ prop: string; startX: number; startWidth: number } | null>(null);
const wrapRef = ref<HTMLElement | null>(null);
const wrapWidth = ref(0);
let resizeObserver: ResizeObserver | null = null;

function sameColumn(left: TableColumn, right: TableColumn): boolean {
  return (
    left.type === right.type &&
    left.prop === right.prop &&
    left.label === right.label &&
    left.width === right.width &&
    left.minWidth === right.minWidth &&
    left.flex === right.flex &&
    left.align === right.align &&
    left.sortable === right.sortable &&
    left.sortBy === right.sortBy &&
    left.mono === right.mono &&
    left.badge === right.badge &&
    left.muted === right.muted &&
    left.ellipsis === right.ellipsis
  );
}

function isColumnNode(node: unknown): node is { props?: Record<string, unknown>; type?: unknown } {
  if (!node || typeof node !== "object") return false;
  const type = (node as { type?: unknown }).type;
  if (!type) return false;
  if (type === VscTableColumn || type === "VscTableColumn") return true;
  if (typeof type === "object") {
    const candidate = type as { name?: string; __name?: string };
    return candidate.name === "VscTableColumn" || candidate.__name === "VscTableColumn";
  }
  return false;
}

function columnKeyFromProps(node: { props?: Record<string, unknown> }, index: number): string {
  const nodeProps = node.props ?? {};
  if (nodeProps.type === "selection") return "__selection__";
  return String(nodeProps.prop || nodeProps.label || `col_${index}`);
}

function flattenColumns(nodes: unknown[]): { props?: Record<string, unknown>; type?: unknown }[] {
  const flat: { props?: Record<string, unknown>; type?: unknown }[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const candidate = node as { type?: unknown; children?: unknown };
    if (candidate.type === Symbol.for("v-fgt") || (Array.isArray(candidate.children) && !isColumnNode(node))) {
      if (Array.isArray(candidate.children)) {
        flat.push(...flattenColumns(candidate.children));
        continue;
      }
    }
    if (isColumnNode(node)) flat.push(node);
  }
  return flat;
}

function declaredColumns(): string[] {
  const nodes = flattenColumns(slots.default?.() ?? []);
  const ids: string[] = [];
  let index = 0;
  for (const node of nodes) {
    ids.push(columnKeyFromProps(node, index));
    index += 1;
  }
  return ids;
}

function refreshColumnCache(): void {
  registeredColumns.value = new Map();
  declaredColumnIds.value = declaredColumns();
  columnCacheVersion.value += 1;
}

provide(TABLE_CONTEXT, {
  columnCacheVersion,
  registerColumn(column: TableColumn) {
    const existing = registeredColumns.value.get(column.prop);
    if (existing && sameColumn(existing, column)) {
      existing.renderDefault = column.renderDefault;
      existing.renderHeader = column.renderHeader;
      existing.selectable = column.selectable;
      return;
    }
    const next = new Map(registeredColumns.value);
    next.set(column.prop, existing ? Object.assign(existing, column) : column);
    registeredColumns.value = next;
  },
  unregisterColumn(id: string) {
    if (!registeredColumns.value.has(id)) return;
    const next = new Map(registeredColumns.value);
    next.delete(id);
    registeredColumns.value = next;
  },
});

watch(
  () => props.columns?.length,
  (length) => {
    if (!length) refreshColumnCache();
  },
  { immediate: true },
);

const columns = computed<TableColumn[]>(() => {
  if (props.columns?.length) {
    return props.columns.map((column, index) => {
      const id = column.type === "selection" ? "__selection__" : column.prop || `col_${index}`;
      return { ...column, id, prop: id, label: column.label ?? "" };
    });
  }
  const ordered: TableColumn[] = [];
  const seen = new Set<string>();
  for (const id of declaredColumnIds.value) {
    const column = registeredColumns.value.get(id);
    if (column) {
      ordered.push(column);
      seen.add(id);
    }
  }
  for (const [id, column] of registeredColumns.value) {
    if (!seen.has(id)) ordered.push(column);
  }
  return ordered;
});

const selectionColumn = computed(() => columns.value.find((column) => column.type === "selection"));

function rowKeyOf(row: Row): unknown {
  if (typeof props.rowKey === "function") return props.rowKey(row);
  const value = row?.[props.rowKey];
  if (value != null) return value;
  const index = props.data.indexOf(row);
  return index >= 0 ? index : row;
}

function isSelectionColumn(column: TableColumn): boolean {
  return column.type === "selection";
}

function isResizableColumn(column: TableColumn): boolean {
  return !isSelectionColumn(column) && !!column.prop;
}

function canSelect(row: Row, index: number): boolean {
  const selectable = selectionColumn.value?.selectable;
  return selectable ? selectable(row, index) : true;
}

const rows = computed(() => props.data.slice());

const sortedRows = computed(() => {
  const values = [...rows.value];
  if (!sortProp.value) return values;
  const column = columns.value.find((entry) => entry.prop === sortProp.value);
  if (!column) return values;
  const key = column.sortBy || column.prop;
  const direction = sortOrder.value === "asc" ? 1 : -1;
  values.sort((left, right) => {
    if (column.sortMethod) return column.sortMethod(left, right) * direction;
    const leftValue = left[key];
    const rightValue = right[key];
    const leftNumber = Number(leftValue);
    const rightNumber = Number(rightValue);
    if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
      return (leftNumber - rightNumber) * direction;
    }
    return String(leftValue ?? "").localeCompare(String(rightValue ?? "")) * direction;
  });
  return values;
});

const selectableRows = computed(() => {
  const entries: { row: Row; index: number; key: unknown }[] = [];
  for (let index = 0; index < sortedRows.value.length; index += 1) {
    const row = sortedRows.value[index];
    if (canSelect(row, index)) entries.push({ row, index, key: rowKeyOf(row) });
  }
  return entries;
});

function selectedRows(): Row[] {
  const result: Row[] = [];
  for (let index = 0; index < sortedRows.value.length; index += 1) {
    const row = sortedRows.value[index];
    if (selectedKeys.value.has(rowKeyOf(row))) result.push(row);
  }
  return result;
}

function emitSelectionChange(): void {
  if (!selectionColumn.value) return;
  emit("selection-change", selectedRows());
}

function isRowSelected(row: Row): boolean {
  return selectedKeys.value.has(rowKeyOf(row));
}

function setRowSelection(row: Row, index: number, selected: boolean): void {
  if (!canSelect(row, index)) return;
  const key = rowKeyOf(row);
  const next = new Set(selectedKeys.value);
  if (selected) next.add(key);
  else next.delete(key);
  selectedKeys.value = next;
}

function toggleRowSelection(row: Row, selected?: boolean, index?: number): void {
  const resolvedIndex = index ?? sortedRows.value.indexOf(row);
  if (resolvedIndex < 0) return;
  setRowSelection(row, resolvedIndex, selected ?? !isRowSelected(row));
  emitSelectionChange();
}

function onHeaderCheckbox(value: CheckboxValue): void {
  onSelectAll(Boolean(value));
}

function onRowCheckbox(row: Row, index: number, value: CheckboxValue): void {
  onRowSelectionChange(row, index, Boolean(value));
}

function onRowSelectionChange(row: Row, index: number, value: boolean): void {
  setRowSelection(row, index, value);
  emitSelectionChange();
}

const allSelected = computed(() => {
  if (!selectableRows.value.length) return false;
  for (const entry of selectableRows.value) {
    if (!selectedKeys.value.has(entry.key)) return false;
  }
  return true;
});

const someSelected = computed(() => {
  if (!selectableRows.value.length || allSelected.value) return false;
  for (const entry of selectableRows.value) {
    if (selectedKeys.value.has(entry.key)) return true;
  }
  return false;
});

function onSelectAll(value: boolean): void {
  if (!value) {
    selectedKeys.value = new Set();
    emitSelectionChange();
    return;
  }
  const next = new Set<unknown>();
  for (const entry of selectableRows.value) next.add(entry.key);
  selectedKeys.value = next;
  emitSelectionChange();
}

function clearSelection(): void {
  if (!selectedKeys.value.size) return;
  selectedKeys.value = new Set();
  emit("selection-change", []);
}

function pruneSelection(): void {
  const available = new Set<unknown>();
  for (const row of props.data) available.add(rowKeyOf(row));
  const next = new Set<unknown>();
  let changed = false;
  for (const key of selectedKeys.value) {
    if (available.has(key)) next.add(key);
    else changed = true;
  }
  if (changed) {
    selectedKeys.value = next;
    emitSelectionChange();
  }
}

watch(
  () => props.data,
  async (nextValue, previousValue) => {
    if (previousValue !== undefined && nextValue !== previousValue) {
      await nextTick();
      refreshColumnCache();
    }
    if (props.reserveSelection) {
      pruneSelection();
      return;
    }
    if (previousValue !== undefined && nextValue !== previousValue) clearSelection();
  },
);

function toCssWidth(value: number | string): string {
  return typeof value === "number" || /^\d+(\.\d+)?$/.test(value) ? `${value}px` : value;
}

function numericWidth(value: string | number | undefined, fallback: number): number {
  if (value == null) return fallback;
  if (typeof value === "number") return value;
  const match = String(value).match(/^(\d+(?:\.\d+)?)/);
  if (!match) return fallback;
  const parsed = Number(match[1]);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function minimumWidth(column: TableColumn): number {
  return Math.max(MIN_COLUMN_WIDTH, numericWidth(column.minWidth, 0));
}

function columnWidth(column: TableColumn): number | null {
  const prop = column.prop;
  if (prop && columnWidths.value[prop] != null) return columnWidths.value[prop];
  return column.width == null ? null : numericWidth(column.width, 0);
}

const computedWidths = computed<Record<string, number>>(() => {
  const widths: Record<string, number> = {};
  let fixedTotal = 0;
  const flexible: TableColumn[] = [];
  for (const column of columns.value) {
    const width = columnWidth(column);
    if (width != null) {
      widths[column.prop] = width;
      fixedTotal += width;
      continue;
    }
    flexible.push(column);
  }
  if (!flexible.length) return widths;
  const available = Math.max(0, wrapWidth.value - WRAP_PADDING - fixedTotal);
  let flexibleWidth = MIN_COLUMN_WIDTH;
  if (flexible.length === 1) flexibleWidth = Math.max(MIN_COLUMN_WIDTH, available);
  else if (flexible.length > 1) {
    flexibleWidth = Math.max(MIN_COLUMN_WIDTH, Math.floor(available / flexible.length));
  }
  for (const column of flexible) {
    widths[column.prop] = Math.max(minimumWidth(column), flexibleWidth);
  }
  return widths;
});

function columnTrack(column: TableColumn): string {
  if (!props.fitContent) {
    const width = computedWidths.value[column.prop];
    if (width != null) return `${width}px`;
  }
  const prop = column.prop;
  if (prop && columnWidths.value[prop] != null) return `${columnWidths.value[prop]}px`;
  if (column.flex || column.minWidth != null) {
    return `minmax(${column.minWidth == null ? "0px" : toCssWidth(column.minWidth)}, 1fr)`;
  }
  return column.width == null ? "1fr" : toCssWidth(column.width);
}

const gridStyle = computed<Record<string, string> | undefined>(() => {
  if (!columns.value.length) return undefined;
  return { gridTemplateColumns: columns.value.map((column) => columnTrack(column)).join(" ") };
});

const scrollState = computed<{ scrollable: boolean; style?: Record<string, string> }>(() => {
  if (props.fitContent) return { scrollable: false, style: undefined };
  let total = WRAP_PADDING;
  for (const column of columns.value) {
    total += computedWidths.value[column.prop] ?? MIN_COLUMN_WIDTH;
  }
  if (wrapWidth.value <= 0 || total <= wrapWidth.value) return { scrollable: false, style: undefined };
  return { scrollable: true, style: { minWidth: `${total}px` } };
});

const heightStyle = computed<Record<string, string> | undefined>(() => {
  if (props.height == null || props.height === "") return undefined;
  return { height: typeof props.height === "number" ? `${props.height}px` : props.height };
});

function alignClass(column: TableColumn): string {
  return !column.align || column.align === "left" ? "" : `vsc-table__col--${column.align}`;
}

function toggleSort(column: TableColumn): void {
  if (isSelectionColumn(column) || !column.sortable) return;
  if (sortProp.value !== column.prop) {
    sortProp.value = column.prop;
    sortOrder.value = "asc";
    return;
  }
  if (sortOrder.value === "asc") {
    sortOrder.value = "desc";
    return;
  }
  sortProp.value = null;
  sortOrder.value = "asc";
}

function isSorted(column: TableColumn): boolean {
  return sortProp.value === column.prop;
}

function sortState(column: TableColumn): string {
  return isSorted(column) ? sortOrder.value : "none";
}

function ariaSort(column: TableColumn): string | undefined {
  if (!column.sortable) return undefined;
  if (!isSorted(column)) return "none";
  return sortOrder.value === "asc" ? "ascending" : "descending";
}

function cellValue(row: Row, column: TableColumn): unknown {
  if (!column.prop || isSelectionColumn(column)) return undefined;
  return row?.[column.prop];
}

function hasEllipsis(column: TableColumn): boolean {
  return column.ellipsis !== false;
}

function hasCellSlot(prop: string): boolean {
  return !!slots[`cell-${prop}`];
}

function cellTitle(row: Row, column: TableColumn): string | undefined {
  if (!hasEllipsis(column) || column.renderDefault || hasCellSlot(column.prop)) return undefined;
  const value = cellValue(row, column);
  if (value == null || value === "") return undefined;
  return String(value);
}

function cellClasses(column: TableColumn): Record<string, boolean> {
  return {
    "vsc-table__cell--ellipsis": hasEllipsis(column),
    "vsc-table__cell--mono": !!column.mono,
    "vsc-table__cell--muted": !!column.muted,
    "vsc-table__cell--badge": !!column.badge,
  };
}

function cellScope(row: Row, index: number, column: TableColumn): TableCellScope {
  return { row, $index: index, column, value: cellValue(row, column) };
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const element = target as Element | null;
  return !!element?.closest?.(
    "button, a, .el-checkbox, input, label, .vsc-button, .vsc-table__resize-handle",
  );
}

function onRowClick(row: Row, event: MouseEvent): void {
  if (!isInteractiveTarget(event.target)) emit("row-click", row, event);
}

function onRowDblClick(row: Row, event: MouseEvent): void {
  if (!isInteractiveTarget(event.target)) emit("row-dblclick", row, event);
}

function isCurrentRow(row: Row): boolean {
  if (!props.highlightCurrentRow || props.currentRowKey == null) return false;
  return rowKeyOf(row) === props.currentRowKey;
}

function onResizeMove(event: MouseEvent): void {
  const state = resizing.value;
  if (!state) return;
  const column = columns.value.find((entry) => entry.prop === state.prop);
  if (!column) return;
  const start = minimumWidth(column);
  const width = Math.max(start, state.startWidth + (event.clientX - state.startX));
  columnWidths.value = { ...columnWidths.value, [state.prop]: width };
}

function stopResize(): void {
  resizing.value = null;
  document.removeEventListener("mousemove", onResizeMove);
  document.removeEventListener("mouseup", stopResize);
  document.body.style.removeProperty("cursor");
  document.body.style.removeProperty("user-select");
}

function startResize(column: TableColumn, event: MouseEvent): void {
  if (!isResizableColumn(column)) return;
  event.preventDefault();
  event.stopPropagation();
  const cell = (event.currentTarget as Element | null)?.closest(".vsc-table__col");
  const startWidth =
    columnWidths.value[column.prop] ??
    computedWidths.value[column.prop] ??
    (cell as HTMLElement | null)?.offsetWidth ??
    numericWidth(column.width, MIN_COLUMN_WIDTH);
  resizing.value = { prop: column.prop, startX: event.clientX, startWidth };
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("mousemove", onResizeMove);
  document.addEventListener("mouseup", stopResize);
}

onMounted(() => {
  if (!wrapRef.value) return;
  wrapWidth.value = wrapRef.value.clientWidth;
  resizeObserver = new ResizeObserver((entries) => {
    wrapWidth.value = entries[0]?.contentRect.width ?? 0;
  });
  resizeObserver.observe(wrapRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  stopResize();
});

defineExpose({
  clearSelection,
  toggleRowSelection,
  getSelectionRows: selectedRows,
  refreshColumnCache,
});
</script>

<template>
  <div
    ref="wrapRef"
    class="vsc-table-wrap"
    :style="heightStyle"
  >
    <div
      v-if="loading"
      class="vsc-table__loading"
    >
      <i class="codicon codicon-loading codicon-modifier-spin vsc-table__loading-icon" />
    </div>
    <div
      class="vsc-table"
      :class="{
        'vsc-table--fit': fitContent,
        'vsc-table--resizing': !!resizing,
        'vsc-table--scrollable': scrollState.scrollable,
      }"
      :style="scrollState.style"
    >
      <div
        v-if="columns.length"
        class="vsc-table__header"
        :style="gridStyle"
      >
        <span
          v-for="column in columns"
          :key="column.prop"
          :class="['vsc-table__col', alignClass(column)]"
        >
          <ElCheckbox
            v-if="column.type === 'selection'"
            :model-value="allSelected"
            :indeterminate="someSelected"
            :disabled="!selectableRows.length"
            @change="onHeaderCheckbox"
          />
          <template v-else>
            <TableRender
              v-if="column.renderHeader"
              :render="column.renderHeader"
              :scope="cellScope({}, 0, column)"
            />
            <span
              v-else
              class="vsc-table__sort-label"
            >{{ column.label }}</span>
            <button
              v-if="column.sortable"
              type="button"
              :class="['vsc-table__sort-icon', `vsc-table__sort-icon--${sortState(column)}`]"
              :aria-label="column.label"
              @click="toggleSort(column)"
            >
              <svg
                class="vsc-table__sort-svg"
                viewBox="0 0 8 10"
                aria-hidden="true"
              >
                <polygon
                  class="vsc-table__sort-triangle vsc-table__sort-triangle--up"
                  points="4,0 8,4 0,4"
                />
                <polygon
                  class="vsc-table__sort-triangle vsc-table__sort-triangle--down"
                  points="0,5 8,5 4,9"
                />
              </svg>
            </button>
            <span
              v-if="isResizableColumn(column)"
              class="vsc-table__resize-handle"
              @mousedown="startResize(column, $event)"
            />
          </template>
        </span>
      </div>
      <div
        v-if="!sortedRows.length && !loading"
        class="vsc-table__empty"
      >
        <i :class="['codicon', emptyIcon]" />
        <span v-if="emptyText">{{ emptyText }}</span>
      </div>
      <div
        v-for="(row, rowIndex) in sortedRows"
        :key="String(rowKeyOf(row))"
        :class="['vsc-table__row', { 'vsc-table__row--current': isCurrentRow(row) }]"
        :style="gridStyle"
        @click="onRowClick(row, $event)"
        @dblclick="onRowDblClick(row, $event)"
      >
        <span
          v-for="column in columns"
          :key="column.prop"
          :class="['vsc-table__col', alignClass(column)]"
        >
          <ElCheckbox
            v-if="column.type === 'selection'"
            :model-value="isRowSelected(row)"
            :disabled="!canSelect(row, rowIndex)"
            @change="(value: CheckboxValue) => onRowCheckbox(row, rowIndex, value)"
          />
          <span
            v-else
            :class="['vsc-table__cell', cellClasses(column)]"
            :title="cellTitle(row, column)"
          >
            <TableRender
              v-if="column.renderDefault"
              :render="column.renderDefault"
              :scope="cellScope(row, rowIndex, column)"
            />
            <slot
              v-else-if="hasCellSlot(column.prop)"
              :name="`cell-${column.prop}`"
              :row="row"
              :value="cellValue(row, column)"
            />
            <template v-else>{{ cellValue(row, column) }}</template>
          </span>
        </span>
      </div>
      <div class="vsc-table__columns">
        <slot />
      </div>
    </div>
  </div>
</template>
