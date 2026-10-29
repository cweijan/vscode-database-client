<script setup lang="ts">
import { ElOption, ElSelect } from "element-plus";

defineProps<{
  modelValue: string;
  label?: string;
  disabled?: boolean;
  options: ReadonlyArray<
    | string
    | { readonly value: string; readonly label: string }
  >;
}>();

function optionValue(option: string | { value: string }): string {
  return typeof option === "string" ? option : option.value;
}

function optionLabel(option: string | { label: string }): string {
  return typeof option === "string" ? option : option.label;
}

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<template>
  <div class="inline-flex items-center">
    <label
      v-if="label"
      class="common_input_label"
    >
      {{ label }}
    </label>
    <ElSelect
      :model-value="modelValue"
      size="small"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', String($event ?? ''))"
    >
      <ElOption
        v-for="option in options"
        :key="optionValue(option)"
        :value="optionValue(option)"
        :label="optionLabel(option)"
      />
    </ElSelect>
  </div>
</template>
