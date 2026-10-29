<script setup lang="ts">
defineProps<{
  modelValue: string | number;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
}>();

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
    <input
      class="common_input_width field__input"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :type="type"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
  </div>
</template>
