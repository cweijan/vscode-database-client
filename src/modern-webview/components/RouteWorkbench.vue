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
let messageSubscription: BridgeDisposable | undefined;
let saveRequestSubscription: BridgeDisposable | undefined;

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

function parseInput(): unknown {
  const value = input.value.trim();
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function initializeProtocol(): void {
  switch (props.routeName) {
    case "mock":
      bridge?.init("mock");
      return;
    case "fileManager":
      bridge?.init("fileManager");
      return;
    case "sshTerminal":
      bridge?.emit("initSftpConfig");
      bridge?.emit("initSftp");
      bridge?.emit("initTerminal");
      return;
    case "dbFileConnect":
    case "parquet":
    case "sqlite":
      bridge?.emit("init");
      return;
    case "structDiff":
      bridge?.init("structDiff");
      bridge?.emit("getUser");
      return;
    case "rabbitQueueView":
      bridge?.init("rabbitQueueView");
      return;
    case "keyView":
    case "esStatus":
      bridge?.init(props.routeName);
      return;
    case "forward":
      bridge?.init("forward");
      return;
    case "sshStatus":
    case "sshMonitor":
      bridge?.init(props.routeName);
      return;
    default:
      bridge?.emit(`route-${props.routeName}`);
  }
}

function sendPayload(type: string, fallback: unknown = parseInput()): void {
  emitAction(type, fallback);
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
    status.value = content && typeof content === "object" && "message" in content
      ? String((content as { message?: unknown }).message ?? "Host action failed.")
      : String(content ?? "Host action failed.");
  });
  messageSubscription = bridge?.onAny((content, message) => {
    if (["setState", "result", "error"].includes(message.type)) return;
    if (content && typeof content === "object") {
      applyState({ [message.type]: content, ...content as Record<string, unknown> });
    } else if (content !== undefined) {
      state[message.type] = content;
    }
  });
  saveRequestSubscription = bridge?.on("requestSave", () => {
    const data = Array.isArray(state.data) ? state.data.map(Number) : [];
    bridge?.emit("saveContent", { data });
  });
  initializeProtocol();
});

onBeforeUnmount(() => {
  stateSubscription?.dispose();
  resultSubscription?.dispose();
  errorSubscription?.dispose();
  messageSubscription?.dispose();
  saveRequestSubscription?.dispose();
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
        :placeholder="routeName === 'xterm' || routeName === 'sshTerminal' ? 'Enter command' : 'JSON payload or path'"
        @keyup.enter="emitAction(routeName === 'xterm' || routeName === 'sshTerminal' ? 'input' : 'execute')"
      >
      <UiButton
        type="button"
        @click="emitAction('execute')"
      >
        Send
      </UiButton>
    </div>

    <div class="route-workbench__protocol-actions">
      <template v-if="routeName === 'fileManager' || routeName === 'sshTerminal'">
        <UiButton
          type="button"
          @click="sendPayload('load', { path: input || '/' })"
        >
          Load path
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="sendPayload('refreshAdapter')"
        >
          Reload adapter
        </UiButton>
      </template>
      <template v-else-if="routeName === 'dbFileConnect'">
        <UiButton
          type="button"
          @click="sendPayload('connecting', { connectionOption: { dbPath: input || state.fileName, dbType: 'SQLite', name: state.fileName } })"
        >
          Connect SQLite
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="sendPayload('reveal')"
        >
          Reveal file
        </UiButton>
      </template>
      <template v-else-if="routeName === 'parquet'">
        <UiButton
          type="button"
          @click="sendPayload('save')"
        >
          Save file
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="sendPayload('revert')"
        >
          Revert file
        </UiButton>
      </template>
      <template v-else-if="routeName === 'mock'">
        <UiButton
          type="button"
          @click="sendPayload('saveMock', state.mockMeta || parseInput())"
        >
          Save model
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('resetMock')"
        >
          Reset model
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('runMock', state.mockMeta || parseInput())"
        >
          Run mock
        </UiButton>
      </template>
      <template v-else-if="routeName === 'rabbitQueueView'">
        <UiButton
          type="button"
          @click="sendPayload('loadMessages', { count: Number(input) || 30 })"
        >
          Messages
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('loadBindings')"
        >
          Bindings
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('loadExchanges')"
        >
          Exchanges
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('loadConsumers')"
        >
          Consumers
        </UiButton>
      </template>
      <template v-else-if="routeName === 'keyView'">
        <UiButton
          type="button"
          @click="sendPayload('refresh')"
        >
          Refresh key
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('update', { value: input })"
        >
          Save value
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="sendPayload('del')"
        >
          Delete key
        </UiButton>
      </template>
      <template v-else-if="routeName === 'esStatus'">
        <UiButton
          type="button"
          @click="sendPayload('refresh_es_status')"
        >
          Refresh status
        </UiButton>
      </template>
      <template v-else-if="routeName === 'forward'">
        <UiButton
          type="button"
          @click="sendPayload('reloadForward')"
        >
          Reload forwards
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('save', parseInput())"
        >
          Save forward
        </UiButton>
      </template>
      <template v-else-if="routeName === 'structDiff'">
        <UiButton
          type="button"
          @click="sendPayload('loadDB', { key: input || (state.connection as Record<string, unknown> | undefined)?.id })"
        >
          Load source DB
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('loadDB', { key: input || (state.connection as Record<string, unknown> | undefined)?.id, isTarget: true })"
        >
          Load target DB
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('getUser')"
        >
          Load user
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('compare')"
        >
          Compare
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('sync', { sqlList: Array.isArray(state.sqlList) ? state.sqlList : [], option: state.option || {} })"
        >
          Sync
        </UiButton>
      </template>
      <template v-else-if="routeName === 'sshStatus' || routeName === 'sshMonitor'">
        <UiButton
          type="button"
          @click="sendPayload('cpu')"
        >
          CPU
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('memory')"
        >
          Memory
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('disk')"
        >
          Disk
        </UiButton>
        <UiButton
          type="button"
          @click="sendPayload('processes')"
        >
          Processes
        </UiButton>
      </template>
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
