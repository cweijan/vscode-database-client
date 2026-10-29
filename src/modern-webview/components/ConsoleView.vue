<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import SettingsView from "./SettingsView.vue";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const sql = ref("SELECT 1;");
const status = ref("");
const settingsVisible = ref(false);
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

function messageText(content: unknown, fallback: string): string {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const message = (content as { message?: unknown }).message;
    if (message) return String(message);
  }
  return content ? String(content) : fallback;
}

onMounted(() => {
  resultSubscription = bridge?.on("result", () => {
    status.value = "Query completed.";
  });
  errorSubscription = bridge?.on("error", (content) => {
    status.value = messageText(content, "Query failed.");
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
        <VscButton
          @click="run"
        >
          Run
        </VscButton>
        <VscButton
          type="default"
          @click="clear"
        >
          Clear
        </VscButton>
        <VscButton
          type="default"
          @click="settingsVisible = !settingsVisible"
        >
          {{ settingsVisible ? "Console" : "Settings" }}
        </VscButton>
      </div>
    </header>
    <template v-if="!settingsVisible">
      <textarea
        v-model="sql"
        class="field__input console-view__editor"
        spellcheck="false"
      />
    </template>
    <SettingsView v-else />
    <p
      v-if="status"
      class="route-workspace__status"
    >
      {{ status }}
    </p>
  </section>
</template>
