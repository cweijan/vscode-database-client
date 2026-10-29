import type { InjectionKey, Ref } from "vue";

export interface TableColumn {
  id: string;
  type: string;
  prop: string;
  label: string;
  width?: string | number;
  minWidth?: string | number;
  align?: string;
  sortable?: boolean;
  sortBy?: string;
  sortMethod?: (left: Record<string, unknown>, right: Record<string, unknown>) => number;
  selectable?: (row: unknown, index: number) => boolean;
  flex?: boolean;
  mono?: boolean;
  badge?: boolean;
  muted?: boolean;
  ellipsis?: boolean;
  renderDefault?: (scope: TableCellScope) => unknown;
  renderHeader?: () => unknown;
}

export interface TableCellScope {
  row: unknown;
  $index: number;
  column: TableColumn;
  value: unknown;
}

export interface TableContext {
  columnCacheVersion: Ref<number>;
  registerColumn(column: TableColumn): void;
  unregisterColumn(id: string): void;
}

export type CheckboxValue = string | number | boolean;

export const TABLE_CONTEXT: InjectionKey<TableContext> = Symbol("VscTableContext");
