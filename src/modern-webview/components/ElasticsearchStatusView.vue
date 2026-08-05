<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";

interface ElasticsearchNodeStatus {
  readonly ip?: unknown;
  readonly name?: unknown;
  readonly isMain?: unknown;
  readonly master?: unknown;
  readonly heapPercent?: unknown;
  readonly diskUsage?: unknown;
  readonly cpuUsage?: unknown;
  readonly load_5m?: unknown;
  readonly "segments.count"?: unknown;
  readonly "segments.memory"?: unknown;
  readonly [key: string]: unknown;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const initial = bootstrap.state.esStatus;
const nodes = ref<ElasticsearchNodeStatus[]>(Array.isArray(initial) ? initial as ElasticsearchNodeStatus[] : []);
const message = ref("");
let statusSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

function text(value: unknown, fallback = "-"): string {
  return value == null ? fallback : String(value);
}

function applyStatus(content: unknown): void {
  nodes.value = Array.isArray(content)
    ? content.filter((item): item is ElasticsearchNodeStatus => Boolean(item && typeof item === "object"))
    : [];
  message.value = "";
}

function emit(type: string): void {
  bridge?.emit(type);
}

const rawStatus = computed(() => {
  try {
    return JSON.stringify(nodes.value, null, 2);
  } catch {
    return String(nodes.value);
  }
});

onMounted(() => {
  statusSubscription = bridge?.on("esStatus", applyStatus);
  errorSubscription = bridge?.on("error", (content) => {
    const error = content && typeof content === "object" && !Array.isArray(content)
      ? (content as Record<string, unknown>).message
      : content;
    message.value = text(error, "Elasticsearch status request failed.");
  });
  bridge?.init("esStatus");
});

onBeforeUnmount(() => {
  statusSubscription?.dispose();
  errorSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace elasticsearch-status-view"
    data-route="esStatus"
  >
    <header class="route-workspace__header">
      <div>
        <h1>Elasticsearch nodes</h1>
        <p class="route-workspace__subline">
          {{ nodes.length }} node(s) reported by _cat/nodes
        </p>
      </div>
      <UiButton
        type="button"
        @click="emit('refresh_es_status')"
      >
        Refresh status
      </UiButton>
    </header>

    <p
      v-if="message"
      class="route-workspace__error"
    >
      {{ message }}
    </p>
    <div
      v-if="nodes.length > 0"
      class="result-view__table-wrap"
    >
      <table class="result-view__table">
        <thead>
          <tr>
            <th>IP</th>
            <th>Name</th>
            <th>Master</th>
            <th>Heap</th>
            <th>Disk</th>
            <th>CPU</th>
            <th>Load (5m)</th>
            <th>Segments</th>
            <th>Segment memory</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(node, index) in nodes"
            :key="`${text(node.ip)}-${text(node.name)}-${index}`"
          >
            <td>{{ text(node.ip) }}</td>
            <td>{{ text(node.name) }}</td>
            <td>{{ node.isMain || node.master === "*" ? "Yes" : "No" }}</td>
            <td>{{ text(node.heapPercent) }}</td>
            <td>{{ text(node.diskUsage) }}</td>
            <td>{{ text(node.cpuUsage) }}</td>
            <td>{{ text(node.load_5m) }}</td>
            <td>{{ text(node["segments.count"]) }}</td>
            <td>{{ text(node["segments.memory"]) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p
      v-else-if="!message"
      class="route-workspace__empty"
    >
      No Elasticsearch node status returned.
    </p>
    <details>
      <summary>Raw response</summary>
      <pre class="route-workbench__state">{{ rawStatus }}</pre>
    </details>
  </section>
</template>
