<script setup lang="ts">
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
  <label class="vsc-field">
    <span
      v-if="label"
      class="vsc-field__label"
    >
      {{ label }}
    </span>
    <select
      class="vsc-input"
      :value="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option
        v-for="option in options"
        :key="optionValue(option)"
        :value="optionValue(option)"
      >
        {{ optionLabel(option) }}
      </option>
    </select>
  </label>
</template>
