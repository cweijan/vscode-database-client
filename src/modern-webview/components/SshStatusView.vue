<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";
import UiInput from "./UiInput.vue";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const output = reactive<Record<string, string>>({
  info: typeof bootstrap.state.info === "string" ? bootstrap.state.info : "",
});
const serverType = ref("ssh");
const processLimit = ref("20");
const lastAction = ref("");
const subscriptions: BridgeDisposable[] = [];

function messageText(content: unknown): string {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const value = content as Record<string, unknown>;
    if (value.output != null) return String(value.output);
    if (value.system != null) return String(value.system);
    if (value.message != null) return String(value.message);
  }
  return String(content ?? "");
}

function load(metric: string): void {
  lastAction.value = `Loading ${metric}…`;
  bridge?.emit("${metric}", metric === "processes" ? { limit: Number(processLimit.value) || 20 } : undefined);
}

onMounted(() => {
  subscriptions.push(bridge?.on("serverType", (content) => { serverType.value = String(content || "ssh"); }) as BridgeDisposable);
  for (const type of ["info", "cpu", "memory", "disk", "network", "processes"]) {
    subscriptions.push(bridge?.on(type, (content) => {
      output[type] = messageText(content);
      lastAction.value = `${type} loaded.`;
    }) as BridgeDisposable);
  }
  subscriptions.push(bridge?.on("error", (content) => {
    output.error = messageText(content);
    lastAction.value = "Request failed.";
  }) as BridgeDisposable);
  bridge?.init("sshStatus");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace ssh-status-view"
    data-route="sshStatus"
  >
    <header class="route-workspace__header">
      <div>
        <h1>SSH server status</h1>
        <p class="route-workspace__subline">
          {{ serverType }} · {{ lastAction || "Ready" }}
        </p>
      </div>
      <UiButton
        type="button"
        @click="bridge?.init('sshStatus')"
      >
        Refresh info
      </UiButton>
    </header>

    <div class="route-workbench__protocol-actions">
      <UiButton
        v-for="metric in ['cpu', 'memory', 'disk', 'network']"
        :key="metric"
        type="button"
        variant="default"
        @click="load(metric)"
      >
        {{ metric }}
      </UiButton>
    </div>

    <div class="connection-view__grid">
      <UiInput
        v-model="processLimit"
        label="Process count"
        type="number"
      />
      <UiButton
        type="button"
        @click="load('processes')"
      >
        Load processes
      </UiButton>
    </div>

    <div class="connection-view__grid ssh-status-view__grid">
      <article
        v-for="(value, key) in output"
        :key="key"
        class="route-workbench__state"
      >
        <h2>{{ key }}</h2>
        <pre>{{ value || "No data returned." }}</pre>
      </article>
    </div>
  </section>
</template>
