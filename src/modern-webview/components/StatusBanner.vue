<script setup lang="ts">
withDefaults(
  defineProps<{
    kind?: "info" | "error";
    message: string;
  }>(),
  { kind: "info" },
);
</script>

<template>
  <p
    class="status-banner"
    :class="{ ['status-banner--' + kind]: true }"
    role="status"
  >
    {{ message }}
  </p>
</template>
