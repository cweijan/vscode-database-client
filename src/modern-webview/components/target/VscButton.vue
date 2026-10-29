<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: string;
    type?: string;
    icon?: string;
    loading?: boolean;
    disabled?: boolean;
    title?: string;
  }>(),
  { size: "default", type: "default", icon: "", loading: false, disabled: false, title: "" },
);

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<template>
  <button
    :title="title"
    :class="[
      'vsc-button',
      [
        type ? `vsc-button--${type}` : '',
        size ? `vsc-button--${size}` : '',
        { 'is-disabled': disabled, 'is-loading': loading },
      ],
    ]"
    :disabled="disabled || loading"
    @click="emit('click', $event)"
  >
    <i
      v-if="loading"
      class="el-icon-loading"
    />
    <i
      v-else-if="icon"
      :class="icon"
    />
    <span v-if="$slots.default"><slot /></span>
  </button>
</template>
