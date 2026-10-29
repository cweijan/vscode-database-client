<script setup lang="ts">
import { ElTooltip } from "element-plus";

import { usePayState } from "../../license";

withDefaults(
  defineProps<{
    left?: string | number;
  }>(),
  { left: "7px" },
);

const isPay = usePayState();
</script>

<template>
  <ElTooltip
    v-if="!isPay"
    popper-class="vsc-tooltip"
    effect="dark"
    content="Premium Only"
    :style="{ left, top: '-1px' }"
    :offset="20"
  >
    <slot />
  </ElTooltip>
  <slot v-else />
</template>
