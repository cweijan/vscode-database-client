<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import type { WebviewRouteName } from "../routeRegistry";

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
    structDiff: "Structure Diff",
    keyView: "Key-Value Viewer",
    rabbitQueueView: "RabbitMQ Queue",
    forward: "Port Forwarding",
    xterm: "Terminal",
    sshTerminal: "SSH Terminal",
    fileManager: "File Manager",
    sshStatus: "SSH Status",
    sshMonitor: "SSH Monitor",
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
        <VscButton
          @click="emitAction('refresh')"
        >
          Refresh
        </VscButton>
        <VscButton
          type="default"
          @click="emitAction('close')"
        >
          Close
        </VscButton>
      </div>
    </header>

    <div class="route-workbench__toolbar">
      <input
        v-model="input"
        class="field__input"
        :placeholder="routeName === 'xterm' || routeName === 'sshTerminal' ? 'Enter command' : 'JSON payload or path'"
        @keyup.enter="emitAction(routeName === 'xterm' || routeName === 'sshTerminal' ? 'input' : 'execute')"
      >
      <VscButton
        @click="emitAction('execute')"
      >
        Send
      </VscButton>
    </div>

    <div class="route-workbench__protocol-actions">
      <template v-if="routeName === 'fileManager' || routeName === 'sshTerminal'">
        <VscButton
          @click="sendPayload('load', { path: input || '/' })"
        >
          Load path
        </VscButton>
        <VscButton
          type="default"
          @click="sendPayload('refreshAdapter')"
        >
          Reload adapter
        </VscButton>
      </template>
      <template v-else-if="routeName === 'dbFileConnect'">
        <VscButton
          @click="sendPayload('connecting', { connectionOption: { dbPath: input || state.fileName, dbType: 'SQLite', name: state.fileName } })"
        >
          Connect SQLite
        </VscButton>
        <VscButton
          type="default"
          @click="sendPayload('reveal')"
        >
          Reveal file
        </VscButton>
      </template>
      <template v-else-if="routeName === 'parquet'">
        <VscButton
          @click="sendPayload('save')"
        >
          Save file
        </VscButton>
        <VscButton
          type="default"
          @click="sendPayload('revert')"
        >
          Revert file
        </VscButton>
      </template>
      <template v-else-if="routeName === 'rabbitQueueView'">
        <VscButton
          @click="sendPayload('loadMessages', { count: Number(input) || 30 })"
        >
          Messages
        </VscButton>
        <VscButton
          @click="sendPayload('loadBindings')"
        >
          Bindings
        </VscButton>
        <VscButton
          @click="sendPayload('loadExchanges')"
        >
          Exchanges
        </VscButton>
        <VscButton
          @click="sendPayload('loadConsumers')"
        >
          Consumers
        </VscButton>
      </template>
      <template v-else-if="routeName === 'keyView'">
        <VscButton
          @click="sendPayload('refresh')"
        >
          Refresh key
        </VscButton>
        <VscButton
          @click="sendPayload('update', { value: input })"
        >
          Save value
        </VscButton>
        <VscButton
          type="default"
          @click="sendPayload('del')"
        >
          Delete key
        </VscButton>
      </template>
      <template v-else-if="routeName === 'esStatus'">
        <VscButton
          @click="sendPayload('refresh_es_status')"
        >
          Refresh status
        </VscButton>
      </template>
      <template v-else-if="routeName === 'forward'">
        <VscButton
          @click="sendPayload('reloadForward')"
        >
          Reload forwards
        </VscButton>
        <VscButton
          @click="sendPayload('save', parseInput())"
        >
          Save forward
        </VscButton>
      </template>
      <template v-else-if="routeName === 'structDiff'">
        <VscButton
          @click="sendPayload('loadDB', { key: input || (state.connection as Record<string, unknown> | undefined)?.id })"
        >
          Load source DB
        </VscButton>
        <VscButton
          @click="sendPayload('loadDB', { key: input || (state.connection as Record<string, unknown> | undefined)?.id, isTarget: true })"
        >
          Load target DB
        </VscButton>
        <VscButton
          @click="sendPayload('getUser')"
        >
          Load user
        </VscButton>
        <VscButton
          @click="sendPayload('compare')"
        >
          Compare
        </VscButton>
        <VscButton
          @click="sendPayload('sync', { sqlList: Array.isArray(state.sqlList) ? state.sqlList : [], option: state.option || {} })"
        >
          Sync
        </VscButton>
      </template>
      <template v-else-if="routeName === 'sshStatus' || routeName === 'sshMonitor'">
        <VscButton
          @click="sendPayload('cpu')"
        >
          CPU
        </VscButton>
        <VscButton
          @click="sendPayload('memory')"
        >
          Memory
        </VscButton>
        <VscButton
          @click="sendPayload('disk')"
        >
          Disk
        </VscButton>
        <VscButton
          @click="sendPayload('processes')"
        >
          Processes
        </VscButton>
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
