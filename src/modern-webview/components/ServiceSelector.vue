<script setup lang="ts">
import { computed, ref } from "vue";

interface ServerChoice {
  readonly type: string;
  readonly label: string;
  readonly icon: string;
}

interface ServerGroup {
  readonly choices: readonly ServerChoice[];
  readonly more?: boolean;
}

const props = defineProps<{
  modelValue: string;
  groups: readonly ServerGroup[];
  iconFor: (icon: string) => string;
  moreTypes: readonly string[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const moreOpen = ref(false);
const allChoices = computed(() => props.groups.flatMap((group) => group.choices));
const label = computed(() => {
  switch (props.modelValue) {
    case "libSQL":
      return "Turso";
    case "D1":
      return "Cloudflare D1";
    case "AzureSQLServer":
      return "Azure SQL Server";
    case "PrestoDB":
      return "Presto";
    default:
      return props.modelValue;
  }
});
</script>

<template>
  <section class="mb-2">
    <div class="block">
      <ul class="tab">
        <template
          v-for="(group, groupIndex) in groups"
          :key="groupIndex"
        >
          <li
            v-for="choice in group.choices"
            :key="choice.type"
            class="tab__item"
            :class="{ 'tab__item--active': modelValue === choice.type }"
            @click="emit('update:modelValue', choice.type)"
          >
            <img
              class="server-item"
              :src="iconFor(choice.icon)"
              :alt="choice.label"
            >
            <span>{{ choice.label }}</span>
          </li>
          <li class="tab__item px-1 py-[5px] xl:py-2 divider">
            |
          </li>
          <li
            v-if="group.more"
            class="tab__item"
            :class="{ 'tab__item--active': !allChoices.some((choice) => choice.type === modelValue) }"
            @click.stop="moreOpen = !moreOpen"
          >
            <img
              class="server-item"
              :src="iconFor('more.png')"
              alt="More"
            >
            <span>{{ allChoices.some((choice) => choice.type === modelValue) ? "More" : label }}</span>
          </li>
        </template>
      </ul>

      <div
        v-if="moreOpen"
        class="mb-2 pt-2 border-t border-border lg:w-max"
      >
        <div class="block">
          <div class="flex">
            <div class="px-2 py-1 more-server-container">
              <div
                v-for="type in moreTypes"
                :key="type"
                class="el-select-dropdown__item min-w-[100px]"
                :value="type"
                @click="emit('update:modelValue', type); moreOpen = false"
              >
                {{ type }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
