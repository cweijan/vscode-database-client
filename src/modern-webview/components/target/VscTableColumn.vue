<script setup lang="ts">
import { computed, getCurrentInstance, inject, onBeforeUnmount, onMounted, useSlots, watch } from "vue";

import { TABLE_CONTEXT, type TableColumn } from "./tableContext";

const props = withDefaults(
  defineProps<{
    type?: string;
    prop?: string;
    label?: string;
    width?: string | number;
    minWidth?: string | number;
    align?: string;
    sortable?: boolean;
    sortBy?: string;
    selectable?: (row: unknown, index: number) => boolean;
    flex?: boolean;
    mono?: boolean;
    badge?: boolean;
    muted?: boolean;
    ellipsis?: boolean;
  }>(),
  {
    type: "default",
    prop: "",
    label: "",
    width: undefined,
    minWidth: undefined,
    align: undefined,
    sortable: false,
    sortBy: undefined,
    selectable: undefined,
    flex: false,
    mono: false,
    badge: false,
    muted: false,
    ellipsis: true,
  },
);

const slots = useSlots();
const context = inject(TABLE_CONTEXT, null);
const instanceId = getCurrentInstance()?.uid ?? Date.now();

function columnId(): string {
  return props.type === "selection" ? "__selection__" : props.prop || props.label || `col_${instanceId}`;
}

function buildColumn(): TableColumn {
  const selection = props.type === "selection";
  const id = columnId();
  return {
    id,
    type: props.type,
    prop: id,
    label: props.label,
    width: props.width ?? (selection ? 48 : undefined),
    minWidth: props.minWidth,
    flex: props.flex || props.minWidth != null,
    align: props.align ?? (selection ? "center" : undefined),
    sortable: props.sortable,
    sortBy: props.sortBy,
    selectable: props.selectable,
    mono: props.mono,
    badge: props.badge,
    muted: props.muted,
    ellipsis: props.ellipsis,
    renderDefault: slots.default ? (scope) => slots.default?.(scope) : undefined,
    renderHeader: slots.header ? () => slots.header?.() : undefined,
  };
}

function register(): void {
  context?.registerColumn(buildColumn());
}

if (context) {
  onMounted(register);
  watch(
    () => [
      props.type,
      props.prop,
      props.label,
      props.width,
      props.minWidth,
      props.align,
      props.sortable,
      props.sortBy,
      props.flex,
      props.mono,
      props.badge,
      props.muted,
      props.ellipsis,
    ],
    register,
  );
  watch(context.columnCacheVersion, register);
  onBeforeUnmount(() => {
    context.unregisterColumn(columnId());
  });
}

const hiddenStyle = computed(() => ({ display: "none" }));
</script>

<template>
  <span :style="hiddenStyle" />
</template>
