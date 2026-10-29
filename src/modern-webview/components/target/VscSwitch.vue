<script setup lang="ts">
import { Switch as HeadlessSwitch } from "@headlessui/vue";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    disabled?: boolean;
    title?: string;
  }>(),
  { modelValue: false, disabled: false, title: "" },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  change: [value: boolean];
}>();

const checked = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    emit("update:modelValue", value);
  },
});

function onChange(value: boolean): void {
  emit("change", value);
}
</script>

<template>
  <HeadlessSwitch
    v-model="checked"
    :class="[
      'vsc-switch',
      checked ? 'is-checked bg-[var(--vscode-button-background)]' : 'bg-[var(--border-color)]',
      disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
      'relative inline-flex h-5 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
    ]"
    :disabled="disabled"
    @update:model-value="onChange"
  >
    <span
      aria-hidden="true"
      :class="[
        'vsc-switch-inner',
        checked ? 'translate-x-5' : 'translate-x-0',
        checked ? 'bg-gray-300' : 'bg-[var(--vscode-editor-background)]',
        'pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out',
      ]"
    />
  </HeadlessSwitch>
</template>
