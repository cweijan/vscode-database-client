<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: "button" | "submit" | "reset";
    variant?: "default" | "primary" | "danger";
    disabled?: boolean;
  }>(),
  { type: "button", variant: "default", disabled: false },
);

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<template>
  <button
    class="vsc-button"
    :class="`vsc-button--${variant}`"
    :type="type"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>
