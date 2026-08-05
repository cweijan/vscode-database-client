<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import UiButton from "./UiButton.vue";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const sql = ref("SELECT 1;");
const status = ref("");
let resultSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

function run(): void {
  status.value = "Running…";
  bridge?.emit("runSQL", sql.value);
}

function clear(): void {
  sql.value = "";
  status.value = "";
}

onMounted(() => {
  resultSubscription = bridge?.on("result", () => {
    status.value = "Query completed.";
  });
  errorSubscription = bridge?.on("error", (content) => {
    status.value = String(content ?? "Query failed.");
  });
  bridge?.emit("route-console");
});

onBeforeUnmount(() => {
  resultSubscription?.dispose();
  errorSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace console-view"
    data-route="console"
  >
    <header class="route-workspace__header">
      <div>
        <h1>SQL Console</h1>
        <p class="route-workspace__subline">
          Run SQL against the active connection.
        </p>
      </div>
      <div class="route-workspace__actions">
        <UiButton
          type="button"
          @click="run"
        >
          Run
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="clear"
        >
          Clear
        </UiButton>
      </div>
    </header>
    <textarea
      v-model="sql"
      class="vsc-input console-view__editor"
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
