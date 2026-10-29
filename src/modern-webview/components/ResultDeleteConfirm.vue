<script setup lang="ts">
import { ElDialog } from "element-plus";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    hasPrimaryKey?: boolean;
    sql?: string;
    count: number;
  }>(),
  { hasPrimaryKey: true, sql: "" },
);

const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [];
}>();

const visible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit("update:visible", value),
});
</script>

<template>
  <ElDialog
    v-model="visible"
    title="Delete rows"
    width="460px"
    class="delete-confirm"
  >
    <div class="delete-confirm__header">
      <i class="codicon codicon-warning delete-confirm__icon" />
      <span>{{ count }} row(s) will be deleted.</span>
    </div>
    <div
      v-if="hasPrimaryKey"
      class="delete-confirm__option"
    >
      Delete by primary key
    </div>
    <div
      v-else
      class="delete-confirm__sql"
    >
      <span class="io-dialog__label">SQL</span>
      <pre>{{ sql }}</pre>
    </div>
    <div class="delete-confirm__actions">
      <VscButton
        type="secondary"
        size="small"
        @click="visible = false"
      >
        Cancel
      </VscButton>
      <VscButton
        type="danger"
        size="small"
        @click="emit('confirm'); visible = false"
      >
        Delete
      </VscButton>
    </div>
  </ElDialog>
</template>
