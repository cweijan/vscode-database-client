<script setup lang="ts">
import { ElDialog, ElInput, ElRadio, ElRadioGroup } from "element-plus";
import { computed, ref } from "vue";

const props = defineProps<{
  modelValue: boolean;
  mode: "import" | "export";
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [payload: { type: string; path: string; format: string }];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const format = ref("sql");
const path = ref("");
const type = ref("all");

function submit(): void {
  emit("submit", { type: type.value, path: path.value.trim(), format: format.value });
  visible.value = false;
}
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="mode === 'import' ? 'Import' : 'Export'"
    width="520px"
    class="io-dialog"
  >
    <div class="io-dialog__type">
      <span class="mr-4">{{ mode === "import" ? "Source" : "Target" }}</span>
      <ElRadioGroup
        :model-value="format"
        class="io-dialog__radio-group"
        @update:model-value="(value) => (format = String(value))"
      >
        <ElRadio value="sql">
          SQL
        </ElRadio>
        <ElRadio value="csv">
          CSV
        </ElRadio>
        <ElRadio value="json">
          JSON
        </ElRadio>
      </ElRadioGroup>
    </div>

    <div class="io-dialog__section">
      <div class="io-dialog__row">
        <span class="io-dialog__label">Format</span>
        <ElInput
          size="small"
          :model-value="format"
          readonly
        />
      </div>
      <div
        v-if="mode === 'export'"
        class="io-dialog__row"
      >
        <span class="io-dialog__label">Rows</span>
        <ElRadioGroup
          :model-value="type"
          class="io-dialog__radio-group"
          @update:model-value="(value) => (type = String(value))"
        >
          <ElRadio value="all">
            All rows
          </ElRadio>
          <ElRadio value="page">
            Current page
          </ElRadio>
          <ElRadio value="selected">
            Selected rows
          </ElRadio>
        </ElRadioGroup>
      </div>
    </div>

    <div class="io-dialog__section">
      <div class="io-dialog__row">
        <span class="io-dialog__label">File path</span>
        <ElInput
          size="small"
          :model-value="path"
          placeholder="Choose a file"
          @update:model-value="(value: string) => (path = value)"
        />
      </div>
    </div>

    <div class="io-dialog__footer">
      <VscButton
        type="secondary"
        size="small"
        @click="visible = false"
      >
        Cancel
      </VscButton>
      <VscButton
        type="primary"
        size="small"
        @click="submit"
      >
        {{ mode === "import" ? "Import" : "Export" }}
      </VscButton>
    </div>
  </ElDialog>
</template>
