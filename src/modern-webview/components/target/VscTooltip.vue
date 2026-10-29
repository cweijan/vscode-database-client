<script setup lang="ts">
import { ElTooltip, type ElTooltipProps } from "element-plus";

withDefaults(
  defineProps<{
    title: string;
    placement?: ElTooltipProps["placement"];
    delay?: number;
    visible?: boolean;
    disabled?: boolean;
  }>(),
  { placement: "bottom-start", delay: 350, disabled: false },
);
</script>

<template>
  <ElTooltip
    popper-class="vsc-tooltip"
    effect="dark"
    :content="title"
    :placement="placement"
    :show-after="delay"
    :visible="visible"
    :disabled="disabled"
  >
    <slot />
  </ElTooltip>
</template>
