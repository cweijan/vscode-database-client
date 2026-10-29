<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    value?: number | null;
    loading?: boolean;
    error?: boolean | string;
  }>(),
  { value: undefined, loading: false, error: false },
);

const label = computed(() => (props.value == null ? "-" : `${(props.value * 100).toFixed(1)}%`));
const width = computed(() => `${Math.min(100, (props.value ?? 0) * 100)}%`);
const color = computed(() => {
  const value = props.value ?? 0;
  if (value >= 0.85) return "var(--vscode-errorForeground)";
  if (value >= 0.7) return "var(--vscode-terminal-ansiYellow)";
  return "var(--vscode-terminal-ansiGreen)";
});
</script>

<template>
  <div class="metric-bar">
    <span
      v-if="loading"
      class="metric-text"
    >...</span>
    <span
      v-else-if="error"
      class="metric-text error"
    >-</span>
    <template v-else>
      <span class="metric-text">{{ label }}</span>
      <div class="bar-track">
        <div
          class="bar-fill"
          :style="{ width, background: color }"
        />
      </div>
    </template>
  </div>
</template>
