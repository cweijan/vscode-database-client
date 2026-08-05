<script setup lang="ts">
import { computed, inject } from "vue";

import { WEBVIEW_BRIDGE_KEY } from "../bridge";
import { createTranslator } from "../i18n";
import type { WebviewRouteName } from "../router";

const props = defineProps<{
  routeName: WebviewRouteName;
}>();

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const translator = createTranslator("en");
const title = computed(() =>
  translator.t(`webview.route.${props.routeName}`, props.routeName),
);

function requestRouteInitialization(): void {
  bridge?.emit(`route-${props.routeName}`);
}
</script>

<template>
  <section
    class="route-surface"
    :data-route="routeName"
  >
    <header class="route-surface__header">
      <h1>{{ title }}</h1>
      <button
        class="vsc-button"
        type="button"
        @click="requestRouteInitialization"
      >
        Initialize view
      </button>
    </header>
    <p class="route-surface__message">
      {{ translator.t("webview.route.pending") }}
    </p>
  </section>
</template>
