<script setup lang="ts">
import { ElTooltip, type ElTooltipProps } from "element-plus";

withDefaults(
  defineProps<{
    title: string;
    placement?: ElTooltipProps["placement"];
    delay?: number;
    visible?: boolean;
  }>(),
  { placement: "bottom-start", delay: 350 },
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
  >
    <slot />
  </ElTooltip>
</template>
