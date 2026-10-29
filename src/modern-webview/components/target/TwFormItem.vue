<script setup lang="ts">
withDefaults(
  defineProps<{
    required?: boolean;
    label?: string;
    single?: boolean;
  }>(),
  { required: false, label: "", single: false },
);
</script>

<template>
  <div
    class="inline-flex items-center"
    :class="{ single }"
  >
    <label class="tw_form_item_label">
      <RedMark v-if="required" />
      {{ label }}
    </label>
    <div class="shrink-0">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.tw_form_item_label {
  width: 6rem;
  flex-shrink: 0;
  min-width: max-content;
}

.single {
  margin-right: 100%;
}
</style>
