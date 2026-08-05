<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import type { WebviewRouteName } from "../routeRegistry";
import UiButton from "./UiButton.vue";

const props = defineProps<{
  routeName: WebviewRouteName;
}>();

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const state = reactive<Record<string, unknown>>({
  ...bootstrap.state,
});
const input = ref("");
const status = ref("");
let stateSubscription: BridgeDisposable | undefined;
let resultSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

const title = computed(() => {
  const titles: Partial<Record<WebviewRouteName, string>> = {
    dbFileConnect: "Database File",
    parquet: "Parquet Viewer",
    sqlite: "SQLite",
    manager: "Connection Manager",
    esStatus: "Elasticsearch Status",
    erDiagram: "ER Diagram",
    mock: "Data Mock",
    structDiff: "Structure Diff",
    keyView: "Key-Value Viewer",
    rabbitQueueView: "RabbitMQ Queue",
    forward: "Port Forwarding",
    xterm: "Terminal",
    sshTerminal: "SSH Terminal",
    fileManager: "File Manager",
    sshStatus: "SSH Status",
    sshMonitor: "SSH Monitor",
    document: "Document",
    plan: "Plan",
    util: "Utilities",
    image: "Image",
  };
  return titles[props.routeName] ?? props.routeName;
});

const stateText = computed(() => JSON.stringify(state, null, 2));

function emitAction(type: string, content: unknown = input.value): void {
  bridge?.emit(type, content);
  status.value = `${type} sent.`;
}

function applyState(content: unknown): void {
  if (content && typeof content === "object") {
    Object.assign(state, content);
  }
}

onMounted(() => {
  stateSubscription = bridge?.on("setState", applyState);
  resultSubscription = bridge?.on("result", (content) => {
    applyState(content);
    status.value = "Host response received.";
  });
  errorSubscription = bridge?.on("error", (content) => {
    status.value = String(content ?? "Host action failed.");
  });
  bridge?.emit(`route-${props.routeName}`);
});

onBeforeUnmount(() => {
  stateSubscription?.dispose();
  resultSubscription?.dispose();
  errorSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace route-workbench"
    :data-route="routeName"
  >
    <header class="route-workspace__header">
      <div>
        <h1>{{ title }}</h1>
        <p class="route-workspace__subline">
          {{ routeName }} host protocol workspace.
        </p>
      </div>
      <div class="route-workspace__actions">
        <UiButton
          type="button"
          @click="emitAction('refresh')"
        >
          Refresh
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="emitAction('close')"
        >
          Close
        </UiButton>
      </div>
    </header>

    <div class="route-workbench__toolbar">
      <input
        v-model="input"
        class="vsc-input"
        :placeholder="routeName === 'xterm' || routeName === 'sshTerminal' ? 'Enter command' : 'Optional action payload'"
        @keyup.enter="emitAction(routeName === 'xterm' || routeName === 'sshTerminal' ? 'input' : 'execute')"
      >
      <UiButton
        type="button"
        @click="emitAction('execute')"
      >
        Send
      </UiButton>
    </div>

    <p
      v-if="status"
      class="route-workspace__status"
    >
      {{ status }}
    </p>
    <pre class="route-workbench__state">{{ stateText }}</pre>
  </section>
</template>
