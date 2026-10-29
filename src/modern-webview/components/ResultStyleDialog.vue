<script setup lang="ts">
import { ElDialog, ElInput, ElOption, ElSelect, ElSwitch } from "element-plus";
import { computed } from "vue";

interface TableStyle {
  fontSize: number;
  fontFamily: string;
  maximumWidth: number;
  showHeaderFilter: boolean;
}

const props = defineProps<{
  modelValue: boolean;
  style: TableStyle;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "update:style": [value: TableStyle];
  change: [];
}>();

const fontFamilies = [
  "Consolas, monospace",
  "Menlo, monospace",
  "Monaco, monospace",
  "Courier New, monospace",
  "system-ui, sans-serif",
  "Segoe UI, sans-serif",
];

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

function patch(change: Partial<TableStyle>): void {
  emit("update:style", { ...props.style, ...change });
  emit("change");
}
</script>

<template>
  <ElDialog
    v-model="visible"
    title="Column style"
    width="420px"
    class="column-config-dialog"
  >
    <div class="config-item">
      <span class="config-label">Font size</span>
      <ElInput
        type="number"
        size="small"
        :model-value="String(style.fontSize)"
        @update:model-value="(value: string) => patch({ fontSize: Number(value) || 13 })"
      />
    </div>
    <div class="config-item">
      <span class="config-label">Font family</span>
      <ElSelect
        :model-value="style.fontFamily"
        class="font-family-select"
        size="small"
        filterable
        allow-create
        default-first-option
        clearable
        placeholder="Consolas, monospace"
        @update:model-value="(value: string) => patch({ fontFamily: value ?? '' })"
      >
        <ElOption
          v-for="family in fontFamilies"
          :key="family"
          :label="family"
          :value="family"
        />
      </ElSelect>
    </div>
    <div class="config-item maximum-width-config">
      <span class="config-label">Maximum column width <span class="opacity-70">(px)</span></span>
      <ElInput
        type="number"
        size="small"
        :model-value="String(style.maximumWidth)"
        @update:model-value="(value: string) => patch({ maximumWidth: Number(value) || 0 })"
      />
    </div>
    <div class="config-item">
      <span class="config-label">Header filters</span>
      <ElSwitch
        class="header-filter-checkbox"
        :model-value="style.showHeaderFilter"
        @update:model-value="(value: string | number | boolean) => patch({ showHeaderFilter: Boolean(value) })"
      />
    </div>
  </ElDialog>
</template>
