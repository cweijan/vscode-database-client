<script setup lang="ts">
import { ref } from "vue";

withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
  }>(),
  { modelValue: "", placeholder: "" },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const visible = ref(false);

function toggle(): void {
  visible.value = !visible.value;
}
</script>

<template>
  <div class="relative common_input_width inline-flex">
    <input
      :value="modelValue"
      class="w-full field__input"
      :placeholder="placeholder"
      :type="visible ? 'text' : 'password'"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <span
      class="password-toggle"
      @click="toggle"
    >
      <svg
        v-if="visible"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle
          cx="12"
          cy="12"
          r="3"
        />
      </svg>
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line
          x1="1"
          y1="1"
          x2="23"
          y2="23"
        />
      </svg>
    </span>
  </div>
</template>
