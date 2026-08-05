<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const sql = ref(String((bootstrap.state as Record<string, unknown>).ddl ?? ""));
const status = ref("");
let dataSubscription: BridgeDisposable | undefined;
let resultSubscription: BridgeDisposable | undefined;

function execute(): void {
  bridge?.emit("execute", sql.value);
  status.value = "DDL sent to the host.";
}

onMounted(() => {
  dataSubscription = bridge?.on("design-data", (content) => {
    const value = content as { ddl?: unknown };
    if (typeof value?.ddl === "string") {
      sql.value = value.ddl;
    }
  });
  resultSubscription = bridge?.on("result", () => {
    status.value = "Operation completed.";
  });
  bridge?.emit("route-design");
});

onBeforeUnmount(() => {
  dataSubscription?.dispose();
  resultSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace design-view"
    data-route="design"
  >
    <header class="route-workspace__header">
      <div>
        <h1>Table Design</h1>
        <p class="route-workspace__subline">
          Review and execute the generated DDL.
        </p>
      </div>
      <UiButton
        type="button"
        @click="execute"
      >
        Execute
      </UiButton>
    </header>
    <textarea
      v-model="sql"
      class="vsc-input design-view__editor"
      spellcheck="false"
    />
    <p
      v-if="status"
      class="route-workspace__status"
    >
      {{ status }}
    </p>
  </section>
</template>
