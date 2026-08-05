<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";

interface ElasticsearchStatus {
  readonly cluster_name?: unknown;
  readonly status?: unknown;
  readonly number_of_nodes?: unknown;
  readonly number_of_data_nodes?: unknown;
  readonly active_shards?: unknown;
  readonly active_primary_shards?: unknown;
  readonly relocating_shards?: unknown;
  readonly initializing_shards?: unknown;
  readonly unassigned_shards?: unknown;
  readonly [key: string]: unknown;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const initial = bootstrap.state as ElasticsearchStatus;
const status = reactive<ElasticsearchStatus>({ ...initial });
const message = ref("");
let statusSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = "-"): string {
  return value == null ? fallback : String(value);
}

function applyStatus(content: unknown): void {
  Object.assign(status, record(content));
  message.value = "";
}

function emit(type: string): void {
  bridge?.emit(type);
}

const healthClass = computed(() => {
  const value = text(status.status, "unknown").toLowerCase();
  return `es-status--${value}`;
});

const rawStatus = computed(() => {
  try {
    return JSON.stringify(status, null, 2);
  } catch {
    return String(status);
  }
});

onMounted(() => {
  statusSubscription = bridge?.on("esStatus", applyStatus);
  errorSubscription = bridge?.on("error", (content) => {
    message.value = text(record(content).message || content, "Elasticsearch status request failed.");
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
        <h1>Elasticsearch cluster</h1>
        <p class="route-workspace__subline">
          {{ text(status.cluster_name, "Unnamed cluster") }}
        </p>
      </div>
      <UiButton
        type="button"
        @click="emit('refresh_es_status')"
      >
        Refresh status
      </UiButton>
    </header>

    <div class="route-workbench__protocol-actions">
      <span
        class="status-banner"
        :class="healthClass"
      >
        Health: {{ text(status.status, "unknown") }}
      </span>
      <span class="route-workspace__subline">
        Nodes: {{ text(status.number_of_nodes) }} · Data nodes: {{ text(status.number_of_data_nodes) }} ·
        Unassigned: {{ text(status.unassigned_shards) }}
      </span>
    </div>

    <p
      v-if="message"
      class="route-workspace__error"
    >
      {{ message }}
    </p>
    <pre class="route-workbench__state">{{ rawStatus }}</pre>
  </section>
</template>
