<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    width?: string;
  }>(),
  { width: "600px" },
);

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div
    v-if="open"
    class="connection-dialog-backdrop"
    role="presentation"
    @click.self="emit('close')"
  >
    <section
      class="connection-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      :style="{ width }"
    >
      <header class="connection-dialog__header">
        <h2>{{ title }}</h2>
        <button
          type="button"
          class="connection-dialog__close"
          aria-label="Close"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <div class="connection-dialog__body">
        <slot />
      </div>
    </section>
  </div>
</template>
