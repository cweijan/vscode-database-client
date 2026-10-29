<script setup lang="ts">
import { ElDialog, ElSwitch } from "element-plus";
import { computed } from "vue";

interface ToolbarItem {
  id: string;
  label: string;
  shortcut: string;
  enabled: boolean;
  premium?: boolean;
  grow?: boolean;
}

const props = defineProps<{
  modelValue: boolean;
  items: ToolbarItem[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "update:items": [value: ToolbarItem[]];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

function toggle(item: ToolbarItem, enabled: boolean): void {
  emit(
    "update:items",
    props.items.map((entry) => (entry.id === item.id ? { ...entry, enabled } : entry)),
  );
}
</script>

<template>
  <ElDialog
    v-model="visible"
    title="Toolbar"
    width="460px"
    class="toolbar-config"
  >
    <div class="toolbar-config__header">
      <span class="toolbar-config__header-label">Toolbar buttons</span>
    </div>
    <div class="toolbar-config__title toolbar-config__title--green">
      Editing
    </div>
    <div
      v-for="item in items"
      :key="item.id"
      class="toolbar-config__row"
    >
      <div class="toolbar-config__item">
        <span class="toolbar-config__label">{{ item.label }}</span>
        <span
          v-if="item.premium"
          class="toolbar-config__premium-badge"
        >Premium</span>
      </div>
      <div
        class="toolbar-config__item toolbar-config__item--grow"
      >
        <span class="toolbar-config__shortcut">{{ item.shortcut }}</span>
        <ElSwitch
          :model-value="item.enabled"
          @update:model-value="(value: string | number | boolean) => toggle(item, Boolean(value))"
        />
      </div>
    </div>
    <div class="toolbar-config__title toolbar-config__title--yellow">
      Appearance
    </div>
    <div class="toolbar-config__section--flat">
      <div class="toolbar-config__row">
        <span class="toolbar-config__label">Compact rows</span>
        <ElSwitch :model-value="false" />
      </div>
      <div class="toolbar-config__title toolbar-config__title--blue">
        Result table
      </div>
    </div>
  </ElDialog>
</template>
